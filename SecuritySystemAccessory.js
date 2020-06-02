// Implements the SecuritySystemAccessory class that is executing the security system
//
//-----------------------------------------------------------------------
// Date        Author      Change
//-----------------------------------------------------------------------
// 15.05.2020  D.Steidl    Created
// 31.05.2020  D.Steidl    JSDoc added
// 02.06.2020  D.Steidl    Bugfix: Open window warning wasn't set back in certain cases
//-----------------------------------------------------------------------

//-----------------------------------------------------------------------
// Global variables
//-----------------------------------------------------------------------

// variables have to be declared explicitly
'use strict'

/** @const {Object} LSTATES               Strings for the logging of the actual security system state */
const LSTATES        =   ["STAY_ARMED", "AWAY_ARMED", "NIGHT_ARMED", "DISARMED", "ALARM_TRIGGERED"];
/** @const {Object} LTARGETSTATES         Strings for the logging of the target security system state */
const LTARGETSTATES  =   ["STAY_ARM",   "AWAY_ARM",   "NIGHT_ARM",   "DISARM"];

//-----------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------

// from JavaScript

// from HomeSecurityLite

//-----------------------------------------------------------------------
// Classes
//-----------------------------------------------------------------------

/**
 * This class provides a security system based on doors and windows. If you arm it (i.e. automatically when
 * the last person leave your home), then it checks whether all of the doors and windows are closed. If not
 * it will sent you a message to remind you, that you left a window or a door open. Otherwise - once armed -
 * it will react on any door or window opening and will trigger the alarm.
 */
class cSecuritySystemAccessory
{
   /**
    * Constructor of the class
    * 
    * @param {Object} cLog                Pointer to logging class
    * @param {Object} cActAccessory       Pointer to own accessory
    * @param {Object} dConfig             Configuration for the plugin
    * @returns {void}                     Nothing
    */
   constructor(cLog, cActAccessory, dConfig)
   {
      // Store values
      this.cActAccessory         = cActAccessory;                                                  // Pointer to logging class
      this.cLog                  = cLog;                                                           // Pointer to own accessory
      this.Config                = dConfig;                                                        // Configuration for the plugin

      // Initialize
      this.eTargetState          = cCharacteristic.SecuritySystemTargetState.DISARM;               // Target state of the security system (disarmed)
      this.eCurrentState         = cCharacteristic.SecuritySystemCurrentState.DISARMED;            // Actual state of the security system (disarmed)
      this.bCurrentSensorState   = false;                                                          // Actual state of the reminder (off)
      this.iTimeoutId            = undefined;                                                      // Id of a set timeout to find it again (no timeout started)
      this.lWindowStates         = [];                                                             // Array with the states of the windows/doors

      // Set Information Accessory
      var cInfo                  = this.cActAccessory.getService(global.cService.AccessoryInformation); // Temporary variable with the AccessoryInformation service
      cInfo.setCharacteristic(global.cCharacteristic.Manufacturer, "D. Steidl");
      cInfo.setCharacteristic(global.cCharacteristic.Model, "SecuritySystem");
      cInfo.setCharacteristic(global.cCharacteristic.SerialNumber, "1");
      cInfo.setCharacteristic(global.cCharacteristic.FirmwareRevision, global.strFWVersion);

      // Initialize SecuritySystem (set values, getter and setter for the target state and the actual state)
      this.cSecuritySystem       = this.cActAccessory.getService(global.cService.SecuritySystem);  // Pointer to the SecuritySystem service
      this.cSecuritySystem
         .getCharacteristic(global.cCharacteristic.SecuritySystemTargetState)
         .setValue(this.eTargetState)
         .on('get', this.getSecuritySystemTargetState.bind(this))
         .on('set', this.setSecuritySystemTargetState.bind(this));
      this.cSecuritySystem
         .getCharacteristic(global.cCharacteristic.SecuritySystemCurrentState)
         .setValue(this.eCurrentState)
         .on('get', this.getSecuritySystemCurrentState.bind(this));

      // Initialize the ContactSensor Service (set value and the getter method)
      this.cContactSensorService = this.cActAccessory.getService(global.cService.ContactSensor);   // Pointer to the ContactSensor service
      this.cContactSensorService
         .getCharacteristic(global.cCharacteristic.ContactSensorState)
         .setValue(this.bCurrentSensorState)
         .on('get', this.getCurrentSensorState.bind(this));
      
      // Accessory is online now
      // this.cActAccessory.updateReachability(true);
      return;
   }

   /**
    * "Get" function for the target state. Delivers the stored state set before only
    * 
    * @param {function} fCallback         Callback function to give back the stored security system target state
    * @returns {void}                     Nothing (value will be given by Callback)
    */
   getSecuritySystemTargetState(fCallback)
   {
      var self = this;
      self.cLog("%s - target state: %s", self.cActAccessory.displayName, LTARGETSTATES[self.eTargetState]);
      // Give back stored state
      fCallback(null, self.eTargetState);
      return;
   }

   /**
    * "Set" function for the target state. 
    * 
    * @param {boolean} bValue             New value for the security system target state
    * @param {function} fCallback         Callback function (send back value if value was set)
    * @returns {void}                     Nothing (value will be given by Callback)
    */
   setSecuritySystemTargetState(bValue, fCallback)
   {
      var self = this;
      // Compare with old value
      var bChanged = (self.eTargetState != bValue);                                                // Value has been changed

      if (bChanged)
      {  // If value has changed
         // Store value
         self.eTargetState = bValue;
         self.cLog("%s - setting target state: %s, Changed: %s", this.cActAccessory.displayName, LTARGETSTATES[self.eTargetState], (bChanged ? "true" : "false"));
         // Run statemachine
         self.RunStatemachine(bChanged, false);
      }
      fCallback(null, self.bCurrentSwitchState);
      return;
   }

   /**
    * "Get" function for the current state. Delivers the state calculated by the state machine
    * 
    * @param {function} fCallback         Callback function to give back the stored security system state
    * @returns {void}                     Nothing (value will be given by Callback)
    */
   getSecuritySystemCurrentState(fCallback)
   {
      var self = this;
      self.cLog("%s - current state: %s", self.cActAccessory.displayName, LSTATES[self.eCurrentState]);
      // Give back stored state
      fCallback(null, self.eCurrentState);
      return;
   }

   /**
    * Function to actively change the current state of the security system
    * 
    * @param {Enumerator} eValue          New value of the actual security system state
    * @returns {void}                     Nothing
    */
   UpdateSecuritySystemCurrentState(eValue)
   {
      var self = this;
      self.cLog("%s - updating current state to %s", this.cActAccessory.displayName, LSTATES[eValue]);
      // Store value local and send it to homebridge
      self.eCurrentState = eValue;
      self.cSecuritySystem.getCharacteristic(global.cCharacteristic.SecuritySystemCurrentState).setValue(eValue, undefined, self.cActAccessory.context);
      return;
   }

   /**
    * "Get" function for current state of the forgot_window_warning
    * 
    * @param {function} fCallback         Callback function to give back the actual state of the forgot_window_warning reminder
    * @returns {void}                     Nothing (value will be given by Callback)
    */
   getCurrentSensorState(fCallback)
   {
      var self = this;
      self.cLog("%s - getting current forgot_window_warning state", this.cActAccessory.displayName);
      // Give back current state
      fCallback(null, self.bCurrentSensorState);
      return;
   }

   /**
    * Function to actively change the state of the virtual window
    * 
    * @param {boolean} bValue             New state of the forgot_window_warning reminder
    * @returns {void}                     Nothing 
    */
   UpdateCurrentSensorState(bValue)
   {
      var self = this;
      self.cLog("%s - updating current forgot_window_warning state to %s", this.cActAccessory.displayName, (bValue ? "true" : "false"));
      // Store value local and send it to homebridge
      self.bCurrentSensorState = bValue;
      self.cContactSensorService.getCharacteristic(global.cCharacteristic.ContactSensorState).setValue(bValue, undefined, self.cActAccessory.context);
      return;
   }

   /**
    * Function that is called from the WindowAndDoorAccessory class every time a window state changes. The state of the corresponding
    * window will be stored and the state machine will be run to see what effects this will take.
    * 
    * @param {number} iSerial             Serial number of the window or door 
    * @param {boolean} bState             New state of the window or door
    * @returns {void}                     Nothing
    */
   setWindowState(iSerial, bState)
   {
      var self = this;
      self.lWindowStates[iSerial] = bState;
      self.RunStatemachine(false, false);
      return;
   }

   /**
    * State machine that is doing the actual security system.
    * 
    * @param {boolean} bChangedTargetState   True if the statemachine is run because of a new target state
    * @param {boolean} bTimeout              True if the statemachine is run because of a timeout
    * @returns                               Nothing
    */
   RunStatemachine(bChangedTargetState, bTimeout)
   {
      var eNewCurrentState;                                                                        // New actual state of the security system to be changed to
      var bNewCurrentSensorState;                                                                  // New reminder state to be changed to
      var self = this;

      // If there's still a timeout running, then stop it
      clearTimeout(self.iTimeoutId);
      self.iTimeoutId = undefined;

      // In case of alarm triggered wait for disarm only
      if ((self.eCurrentState == global.cCharacteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) &&
         (self.eTargetState != global.cCharacteristic.SecuritySystemTargetState.DISARM))
      {
         return;
      }

      // Determine whether a window is opened
      var bWindowOpened = false;
      self.lWindowStates.forEach(bThisWindowOpened => { bWindowOpened = bWindowOpened || bThisWindowOpened; });

      // The state machine
      switch (self.eTargetState)
      {
         //---------------------------------------------------------------
         // STATE: Disarmed
         //-----------------
         case global.cCharacteristic.SecuritySystemTargetState.DISARM:
            // Always go to new state without condition
            eNewCurrentState = global.cCharacteristic.SecuritySystemCurrentState.DISARMED;
            // If switched off then release forgot_window_warning
            bNewCurrentSensorState = false;
            break;

         //---------------------------------------------------------------
         // STATE: At home
         //-----------------
         case global.cCharacteristic.SecuritySystemTargetState.STAY_ARM:
            // Always go to new state without condition
            eNewCurrentState = global.cCharacteristic.SecuritySystemCurrentState.STAY_ARM;
            // If I'm back home release forgot_window_warning
            bNewCurrentSensorState = false;
            break;

         //---------------------------------------------------------------
         // STATE: Away
         //-----------------
         case global.cCharacteristic.SecuritySystemTargetState.AWAY_ARM:

            if (self.eCurrentState != global.cCharacteristic.SecuritySystemCurrentState.AWAY_ARM)
            {  // If the security system is not armed yet, then try to arm it
               if (bWindowOpened)
               {  // If a window is opened, then the security system cannot be activated and a warning for the opened window / door shall be sent 
                  bNewCurrentSensorState = true;
               }
               else
               {  // otherwise switch of warning and activate the security system
                  bNewCurrentSensorState = false;
                  eNewCurrentState = global.cCharacteristic.SecuritySystemCurrentState.AWAY_ARM;
               }
            }
            else
            {  // If it already was armed before and now a window opens, an alarm will be triggered
               if (bWindowOpened)
                  eNewCurrentState = global.cCharacteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
            }
            break;

         //---------------------------------------------------------------
         // STATE: At night
         //-----------------
         case global.cCharacteristic.SecuritySystemTargetState.NIGHT_ARM:

            if (self.eCurrentState != global.cCharacteristic.SecuritySystemCurrentState.NIGHT_ARM)
            {  // If the security system is not armed for the night yet, then try to arm it
               if (bWindowOpened)
               {  // If a window is opened, then the security system cannot be activated and a warning for the opened window / door shall be sent 
                  bNewCurrentSensorState = true;
               }
               else
               {  // otherwise switch of warning and activate the security system
                  bNewCurrentSensorState = false;
                  eNewCurrentState = global.cCharacteristic.SecuritySystemCurrentState.NIGHT_ARM;
               }
            }
            else
            {  // If it already was armed before and now a window opens, an alarm will be triggered
               if (bWindowOpened)
                  eNewCurrentState = global.cCharacteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
            }
            break;
      }

      // If values have been changed, call update functions
      if (eNewCurrentState != this.eCurrentState)
         self.UpdateSecuritySystemCurrentState(eNewCurrentState);
      if (bNewCurrentSensorState != this.bCurrentSensorState)
         self.UpdateCurrentSensorState(bNewCurrentSensorState);
      return;
   }
}

//-----------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------

module.exports = cSecuritySystemAccessory;
