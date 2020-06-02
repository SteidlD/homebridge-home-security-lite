// Implements the HomeSecurityLitePlatform class that is for keeping all the things together
//
//-----------------------------------------------------------------------
// Date        Author      Change
//-----------------------------------------------------------------------
// 15.05.2020  D.Steidl    Created
// 22.05.2020  D.Steidl    JSDoc added
//-----------------------------------------------------------------------

//-----------------------------------------------------------------------
// Global variables
//-----------------------------------------------------------------------

// variables have to be declared explicitly
'use strict'

//-----------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------

// from JavaScript

// from HomeSecurityLite

const cWindowAndDoorAccessory  = require('./WindowAndDoorAccessory')
const cSecuritySystemAccessory = require('./SecuritySystemAccessory')

//-----------------------------------------------------------------------
// Classes 
//-----------------------------------------------------------------------

/**
 * Class for the Platform of the home security lite system
 */
class cHomeSecurityLitePlatform
{
   //-----------------------------------------------------------------------
   /**
    * Platform constructor
    * 
    * @param {Object} cLog                Pointer to logging class
    * @param {Object} dConfig             Configuration for the plugin
    * @param {Object} cApi                Pointer to the API for registering new accessory
    * @returns {void}                     nothing
 */
   constructor(cLog, dConfig, cApi)
   {
      var self = this;
      cLog("HomeSecurityLite Init");

      // Store and initialize values
      self.cLog         = cLog;
      self.dConfig      = dConfig;
      self.cAccessories = [];                                                                      // Store all accessories to find it again
      this.bFastRemind  = false;                                                                   // State of the fast remind feature

      // Check if API pointer is valid
      if (cApi)
      {  // API valid
         // Save the API object as plugin needs to register new accessory via self object
         self.cApi = cApi;
         
         // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
         // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
         // Or start discover new accessories.
         self.cApi.on
         ('didFinishLaunching', 
            function ()
            {
               self.cLog("DidFinishLaunching");

               // Analyse config, use config first, if not set then fall back to default values
               var lWindowsNDoors               = dConfig["windows_and_doors"];                                            // Configuration of the window and door sensors
               var strHomeSecurityLiteName      = dConfig["home_security_lite_name"]    || "Home Security Lite";           // Name of the Home Security Lite accessory
               var strSecuritySystemName        = dConfig["security_system_name"]       || "Security system";              // Name of the Security System accessory
               var strFastCyclicReminderName    = dConfig["fast_cyclic_reminder_name"]  || "Remind me again fast";         // Name of the remind me fast switch
               var strForgotWindowWarningName   = dConfig["forgot_window_warning_name"] || "You forgot to close a window"; // Name of the opened window reminder

               // ------------------------------------------------------------------------
               // Initialize Home security lite accessory
               // ------------------------------------------------------------------------

               // Create a unique id for the home security lite accessory and try to get it from list of known accessories
               var HomeSecurityLiteUUID         = global.cUUIDGen.generate("name" + strHomeSecurityLiteName);              // UUID of the Home Security Lite accessory
               var cActAccessory                = self.cAccessories[HomeSecurityLiteUUID];                                 // Pointer to the accessory if it was restored by homebridge

               if (cActAccessory === undefined)
               {  // If the accessory is not known to homebridge
                  self.cLog("Found new Home Security Lite accessory : %s", strHomeSecurityLiteName);
                  // Instantiate Accessory object
                  cActAccessory                 = new global.cAccessory(strHomeSecurityLiteName, HomeSecurityLiteUUID);
                  // Add a service for a switch input
                  cActAccessory.addService(global.cService.Switch, strFastCyclicReminderName);
                  // Hang accessory into list to find it again later
                  self.cAccessories[cActAccessory.UUID] = cActAccessory;
                  // Now register this accessory with homebridge
                  self.cApi.registerPlatformAccessories("homebridge-home-security-lite", "HomeSecurityLitePlatform", [cActAccessory]);
                  self.cLog("Added new Home Security Lite accessory switch: %s", strFastCyclicReminderName);
               }
               else
               {  // If the accessory is already known to homebridge
                  self.cLog("Home Security Lite accessory is online: %s", cActAccessory.displayName);
               }

               // Set Information Accessory
               var cInfo = cActAccessory.getService(global.cService.AccessoryInformation);                                 // Temporary variable with the AccessoryInformation service      
               cInfo.setCharacteristic(global.cCharacteristic.Manufacturer, "D. Steidl");
               cInfo.setCharacteristic(global.cCharacteristic.Model, "HomeSecurityLite");
               cInfo.setCharacteristic(global.cCharacteristic.SerialNumber, "1");
               cInfo.setCharacteristic(global.cCharacteristic.FirmwareRevision, global.strFWVersion);

               // Initialize SwitchService (set value and connect setter and getter method)
               cActAccessory.getService(global.cService.Switch)
                  .getCharacteristic(global.Characteristic.On)
                  .setValue(this.bFastRemind)
                  .on('get', function (fCallback) { fCallback(null, this.bFastRemind); }.bind(this))
                  .on('set', this.setFastRemind.bind(this));

               // ------------------------------------------------------------------------
               // Initialize System security accessory
               // ------------------------------------------------------------------------

               // Create a unique id for the security system accessory and try to get it from list of known accessories
               var SecuritySystemUUID           = global.cUUIDGen.generate("name" + strSecuritySystemName);                // UUID of the Security System accessory
               var cActAccessory                = self.cAccessories[SecuritySystemUUID];                                   // Pointer to the accessory if it was restored by homebridge
               
               if (cActAccessory === undefined)
               {  // If the accessory is not known to homebridge
                  self.cLog("Found new security system : %s", strSecuritySystemName);
                  // Instantiate Accessory object
                  var cActAccessory             = new global.cAccessory(strSecuritySystemName, SecuritySystemUUID);
                  // Add a security system
                  cActAccessory.addService(global.cService.SecuritySystem, strSecuritySystemName);
                  // Add a service for a contact sensor output (forgot_window_warning)
                  cActAccessory.addService(global.cService.ContactSensor, strForgotWindowWarningName);
                  // Hang accessory into list to find it again later
                  self.cAccessories[cActAccessory.UUID] = new cSecuritySystemAccessory(self.cLog, cActAccessory, dConfig);
                  // Now register this accessory with homebridge
                  self.cApi.registerPlatformAccessories("homebridge-home-security-lite", "HomeSecurityLitePlatform", [cActAccessory]);
                  self.cLog("Added new security system : %s", strSecuritySystemName);
               }
               else
               {  // If the accessory is already known to homebridge
                  self.cLog("Security system is online: %s", cActAccessory.displayName);
                  self.cAccessories[cActAccessory.UUID] = new cSecuritySystemAccessory(self.cLog, (cActAccessory instanceof cSecuritySystemAccessory ? cActAccessory.accessory : cActAccessory), dConfig);
               }

               // ------------------------------------------------------------------------
               // Initialize window and door accessory
               // ------------------------------------------------------------------------

               if (lWindowsNDoors)
               {  // If there's a config for Window and door sensors
                  var iSerial = 0;                                                                                         // Fake serial number (staring by 1)
                  lWindowsNDoors.forEach
                  (  // Parse through all configured window and door sensors
                     function (dWinDoorConfig)
                     {  // Function to initialize one window and door sensor accessory
                        if (dWinDoorConfig.name)
                        {  // If there's a name in the config
                           // Create a unique id for the accessory and try to get it from list of known accessories
                           var UUID = global.cUUIDGen.generate("name" + dWinDoorConfig.name);                              // UUID of the window and door accessory
                           var cActAccessory = self.cAccessories[UUID];                                                    // Pointer to the accessory if it was restored by homebridge

                           // Calculate serial number
                           iSerial = iSerial + 1;

                           if (cActAccessory === undefined)
                           {  // If the accessory is not known to homebridge
                              self.cLog("Found new window or door : %s - %s", dWinDoorConfig.name, dWinDoorConfig.description);

                              // Read the configuration, if not configured then fall back on default values
                              var strSwitchName    = (dConfig["prefix_remind_me"]            || "Remind me of"       ) + " " + dWinDoorConfig.name;   // Name of the switch
                              var strSensorName    = (dConfig["prefix_reminder"]             || "Reminder:"          ) + " " + dWinDoorConfig.name;   // Name of the sensor
                              var strAccessoryName = (dConfig["prefix_reminder_accessory"]   || "Reminder accessory" ) + " " + dWinDoorConfig.name;   // Name of the accessory

                              // Instantiate Accessory object
                              var cActAccessory    = new global.cAccessory(strAccessoryName, UUID);
                              // Add a service for a switch input
                              cActAccessory.addService(global.cService.Switch, strSwitchName);
                              // Add a service for a contact sensor output (delayed contact switch)
                              cActAccessory.addService(global.cService.ContactSensor, strSensorName);
                              // Hang accessory into list to find it again later
                              self.cAccessories[cActAccessory.UUID] = new cWindowAndDoorAccessory(self.cLog, cActAccessory, self.cAccessories[SecuritySystemUUID], dWinDoorConfig, dConfig, iSerial);
                              // Now register this accessory with homebridge
                              self.cApi.registerPlatformAccessories("homebridge-home-security-lite", "HomeSecurityLitePlatform", [cActAccessory]);
                              self.cLog("Added new window or door switch and contact sensor : %s - %s", strSwitchName, strSensorName);
                           }
                           else
                           {  // If the accessory is already known to homebridge
                              self.cLog("Window or door is online: %s", cActAccessory.displayName);
                              self.cAccessories[cActAccessory.UUID] = new cWindowAndDoorAccessory(self.cLog, (cActAccessory instanceof cWindowAndDoorAccessory ? cActAccessory.accessory : cActAccessory), self.cAccessories[SecuritySystemUUID], dWinDoorConfig, dConfig, iSerial);
                           }
                        }
                        else {
                           // If there's no name in config then log an error
                           self.cLog("Window or door %s in configuration has no name", dWinDoorConfig);
                        }
                     }
                  );
               }
               else { // If there's no windows or doors in config then log an error
                  self.cLog("No windows or doors found in configuration", dConfig);
               }
            }.bind(self) // function()
         ); // self.cApi.on('didFinishLaunching',
      } // if (cApi)
   }

   /**
    * Function invoked when homebridge tries to restore cached accessory.
    * The accessory will be stored in a list identified by it's UUID to be processed later
    * 
    * @param {Object} cActAccessory       Accessory object restored from cache
    * @returns {void}                     nothing
    */
   configureAccessory(cActAccessory)
   {
      this.cLog(cActAccessory.displayName, "Configure Accessory");
      this.cAccessories[cActAccessory.UUID] = cActAccessory;
   }

   /**
    * "Set" function for fast remind. Value will be stored and distributed to all the window/door objects
    * 
    * @param {boolean} bValue             Value of the fast remind feature
    * @param {function} fCallback         Callback function to confirm setting of the value
    * @returns {void}                     nothing
    */
   setFastRemind(bValue, fCallback)
   {
      var self = this;
      // Has value changed?
      var bChanged = (self.bFastRemind != bValue);
      if (bChanged)
      {  // If the value has changed
         // Store value
         self.bFastRemind = bValue;
         self.cLog("%s - setting fast remind: %s", this.cActAccessory.displayName, (bValue ? "true" : "false"));
         self.cAccessories.forEach
         (  // Go through all the window and door accessories
            function (cAccessory)
            {
               if (cAccessory instanceof cWindowAndDoorAccessory)
               { // If the accessory has the right type, then give it the value
                  cAccessory.setFastRemind(bValue);
               }
            }
         );
      }
      fCallback(null, self.bFastRemind);
   }
}

//-----------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------

module.exports = cHomeSecurityLitePlatform;
