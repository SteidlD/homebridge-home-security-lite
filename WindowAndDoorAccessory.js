// Implements the cWindowAndDoorAccessory class that is handling the door and window sensors,
// activating and deactivating the window reminders.
//
//-----------------------------------------------------------------------
// Date        Author      Change
//-----------------------------------------------------------------------
// 15.05.2020  D.Steidl    Created
// 31.05.2020  D.Steidl    JSDoc added
//-----------------------------------------------------------------------

//-----------------------------------------------------------------------
// Global variables
//-----------------------------------------------------------------------

// variables have to be declared explicitly
'use strict'

/** @const {Object} ESTATES               Enumeration for state machine */
const ESTATES = {CLOSED: 1, OPENED: 2, REMIND: 3}

//-----------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------

// from JavaScript

// from HomeSecurityLite

//-----------------------------------------------------------------------
// Classes 
//-----------------------------------------------------------------------

/**
 * Class for the window and door contact sensors of the home security lite system. This class provides a virtual switch
 * as input for the state of a real contact sensor and one virtual contact sensor, that "opens" a virtual window with delay
 * to the real window, so a message can be sent as a reminder to close the window.
 */
class cWindowAndDoorAccessory
{
   /**
    * Constructor of the cWindowAndDoorAccessory class. This is reading in all the values and configuration and add all the
    * services and characteristics.
    * 
    * @param {Object} cLog                Pointer to logging class
    * @param {Object} cActAccessory       Pointer to own accessory
    * @param {Object} cSecuritySystem     Pointer to the security system object
    * @param {Object} dWinDoorConfig      Configuration for this window / door sensor
    * @param {Object} dConfig             Configuration for the plugin
    * @param {number} iSerial             A fake serial number (staring with 1 counting up) for the AccessoryInformation Service
    * @returns {void}                     Nothing
    */
   constructor(cLog, cActAccessory, cSecuritySystem, dWinDoorConfig, dConfig, iSerial)
   {
      // Store values
      this.cLog                  = cLog;                                                           // Pointer to logging class
      this.cActAccessory         = cActAccessory;                                                  // Pointer to own accessory
      this.cSecuritySystem       = cSecuritySystem;                                                // Pointer to the security system object
      this.dWinDoorConfig        = dWinDoorConfig;                                                 // Configuration for this window / door sensor
      this.iSerial               = iSerial;                                                        // A fake serial number (staring with 1 counting up) for the AccessoryInformation Service

      // Read the configuration, use door/window config first, if not set then fall back to global config, if not set fall back to default values
      this.iFirstRemind          = dWinDoorConfig["first_remind"]       || dConfig["first_remind"]       || 900;  // for remind of open window after x seconds
      this.iFastCyclicRemind     = dWinDoorConfig["fast_cyclic_remind"] || dConfig["fast_cyclic_remind"] || 120;  // time in seconds for fast cyclic remind (i.e in winter)
      this.iSlowCyclicRemind     = dWinDoorConfig["slow_cyclic_remind"] || dConfig["slow_cyclic_remind"] || 1800; // time in seconds for slow cyclic remind

      // Initialize
      this.bCurrentSwitchState   = false;                                                          // State of the input switch (window closed)
      this.cSecuritySystem.setWindowState(this.iSerial, this.bCurrentSwitchState);                 // Sent state to security system
      this.bCurrentSensorState   = false;                                                          // State of the reminder (switched off)
      this.eState                = ESTATES.CLOSED;                                                 // State of the state machine (window closed=
      this.iTimeoutId            = undefined;                                                      // Id of a started timeout to find it again (No Timeout started yet)
      this.bFastRemind           = false;                                                          // Use fast remind (don't use)

      // Set Information Accessory
      var cInfo = this.cActAccessory.getService(global.cService.AccessoryInformation);
      cInfo.setCharacteristic(global.cCharacteristic.Manufacturer, "D. Steidl");
      cInfo.setCharacteristic(global.cCharacteristic.Model, "ContactSensorDelayer");
      cInfo.setCharacteristic(global.cCharacteristic.SerialNumber, this.iSerial.toString());
      cInfo.setCharacteristic(global.cCharacteristic.FirmwareRevision, global.strFWVersion);

      // Initialize SwitchService (set value and connect get and set methods)
      this.cSwitchService        = this.cActAccessory.getService(global.cService.Switch);
      this.cSwitchService
         .getCharacteristic(global.cCharacteristic.On)
         .setValue(this.bCurrentSwitchState)
         .on('get', this.getCurrentSwitchState.bind(this))
         .on('set', this.setCurrentSwitchState.bind(this));

      // Initialize ContactSensor Service (set value and connect get method)
      this.cContactSensorService = this.cActAccessory.getService(global.cService.ContactSensor);
      this.cContactSensorService
         .getCharacteristic(global.cCharacteristic.ContactSensorState)
         .setValue(this.bCurrentSensorState)
         .on('get', this.getCurrentSensorState.bind(this));

      // Accessory is online now
      // this.cActAccessory.updateReachability(true);
      return;
   }

   /**
    * "Get" function for the switch state. Delivers the stored state set before only
    * 
    * @param {function} fCallback         Callback funtion pointer to sent back the value
    * @returns {void}                     Nothing (value will be given by Callback)
    */
   getCurrentSwitchState(fCallback)
   {
      var self = this;
      self.cLog("%s - current state: %s", self.cActAccessory.displayName, (self.bCurrentSwitchState ? "true" : "false"));
      // Give back stored state
      fCallback(null, self.bCurrentSwitchState);
      return;
   }

   // 
   /**
    * "Set" function for the switch state. On the rising edge (window opened) a timer will be started with the configured
    * "remind_after_secs" delay.
    * 
    * @param {boolean} bValue             Window state (true = open, false = closed)
    * @param {function} fCallback         Callback function (send back value if value was set)
    * @returns {void}                     Nothing (value will be given by Callback)
    */
   setCurrentSwitchState(bValue, fCallback) 
   {
      var self = this;
      // Compare with old value
      var bChanged = (self.bCurrentSwitchState != bValue);                                         // Value has been changed

      if (bChanged)                          
      {  // If value changed
         // Store value
         self.bCurrentSwitchState = bValue;
         // Inform the security system
         self.cSecuritySystem.setWindowState(self.iSerial, self.bCurrentSwitchState);
         self.cLog("%s - setting switch: %s, Changed: %s", this.cActAccessory.displayName, (bValue ? "true" : "false"), (bChanged ? "true" : "false"));
         // Run statemachine
         self.RunStatemachine(false);
      }
      // always acknowledge the reception of the value
      fCallback(null, self.bCurrentSwitchState);
      return;
   }

   /**
    * "Get" function for current state of the virtual window
    * 
    * @param {function} fCallback         Callback function (sent back actual state of the reminder)
    * @returns {void}                     Nothing (value will be given by Callback)
    */
   getCurrentSensorState(fCallback)
   {
      var self = this;
      self.cLog("%s - getting current window/door state", this.cActAccessory.displayName);
      // Give back current state
      fCallback(null, self.bCurrentSensorState);
      return;
   }

   /**
    * Function to actively change the state of the virtual window
    * 
    * @param {boolean} bValue             New state of the reminder
    * @returns {void}                     Nothing
    */
   UpdateCurrentSensorState(bValue)
   {
      var self = this;
      self.cLog("%s - updating current window/door state to %s", this.cActAccessory.displayName, (bValue ? "true" : "false"));
      // Store value local and send it to homebridge
      self.bCurrentSensorState = bValue;
      self.cContactSensorService.getCharacteristic(global.cCharacteristic.ContactSensorState).setValue(bValue, undefined, self.cActAccessory.context);
      return;
   }
   
   /**
    * "Set" function for the fast reminder switch
    * 
    * @param {boolean} bValue             New value of the fast reminder switch
    * @returns {void}                     Nothing
    */
   setFastRemind(bValue)
   {
      this.bFastRemind = bValue;
      return;
   }

   /**
    * State machine that is doing the reminder feature
    * 
    * @param {boolean} bTimeout           Will be set if the statemachine is run by the runout timeout, otherwise it's false
    * @returns {void}                     Nothing
    */
   RunStatemachine(bTimeout)
   {
      var self = this;

      // If there's still a timeout running, then stop it
      clearTimeout(self.iTimeoutId);
      self.iTimeoutId = undefined;

      // The state machine
      switch (self.eState)
      {
         case ESTATES.CLOSED:
            // The window is closed
            if (self.bCurrentSwitchState == true)
            {  // If window was opened, start Timeout and go to state opened
               self.iTimeoutId   = setInterval(self.RunStatemachine.bind(self), self.iFirstRemind * 1000, true);
               self.eState       = ESTATES.OPENED;
            }
            break;

         case ESTATES.OPENED:
            // The window is opened
            if (self.bCurrentSwitchState == false)
            {  // If window was closed before Timeout, go back to closed (Timeout stopped above)
               self.eState       = ESTATES.CLOSED;
            }
            else if (bTimeout == true)
            {  // Time is over. Send a remind, start another timer for reminding again and go to remind state
               self.UpdateCurrentSensorState(true);
               self.iTimeoutId   = setInterval(self.RunStatemachine.bind(self), ((self.bFastRemind ? self.iFastCyclicRemind : self.iSlowCyclicRemind) - 1) * 1000, true);
               self.eState       = ESTATES.REMIND;
            }
            break;

         case ESTATES.REMIND:
            // The reminder was sent, wait for window to be closed or send another reminder
            if (self.bCurrentSwitchState == false)
            {  // If window was closed now, quit the reminder and go back to closed (Timeout stopped above)
               self.UpdateCurrentSensorState(false);
               self.eState       = ESTATES.CLOSED;
            }
            else if (bTimeout == true)
            {  // Time is over again and the window still not closed. "Close" virtual window for a second and start timer to reopen it in a second.
               // Then go to OPENED to wait for the timer to run out again
               self.UpdateCurrentSensorState(false);
               self.iTimeoutId   = setInterval(self.RunStatemachine.bind(self), 1000, true);
               self.eState       = ESTATES.OPENED;
            }
            break;
      }
      return;
   }
}

//-----------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------

module.exports = cWindowAndDoorAccessory;
