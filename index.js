// Main file for plugin
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

/** @type {Object}     Pointer to Homebridge.platformAccessory */
var cAccessory;                                                                                    
/** @type {Object}     Pointer to Homebridge.hap.Service */
var cService;
/** @type {Object}     Pointer to Homebridge.hap.Characteristic */
var cCharacteristic;                                                                               
/** @type {Object}     Pointer to Homebridge.hap.uuid */
var cUUIDGen;                                                                                      
/** @type {String}     FW-Version of the plugin (shown in Homekit) */
var strFWVersion;                                                                                  
//-----------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------

// from JavaScript

// from HomeSecurityLite
const cHomeSecurityLitePlatform = require('./HomeSecurityLitePlatform')
const packageJson = require('./package.json')

//-----------------------------------------------------------------------
// Classes 
//-----------------------------------------------------------------------

//-----------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------

/**
 * Anonymous funtion called by homebridge
 * 
 * @param {Object} cHomebridge            Pointer to homebridge object
 * @returns {void}                        nothing
 */
module.exports = function (cHomebridge)
{
   global.strFWVersion     = packageJson.version;
   console.log("Homebridge API version: " + cHomebridge.version + " HomeSecurityLite V" + global.strFWVersion);

   // Accessory must be created from PlatformAccessory Constructor
   global.cAccessory       = cHomebridge.platformAccessory;

   // Service and Characteristic are from hap-nodejs
   global.cService         = cHomebridge.hap.Service;
   global.cCharacteristic  = cHomebridge.hap.Characteristic;
   global.cUUIDGen         = cHomebridge.hap.uuid;
 
   // For platform plugin to be considered as dynamic platform plugin,
   // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
   cHomebridge.registerPlatform(packageJson.name, "HomeSecurityLitePlatform", cHomeSecurityLitePlatform, true);
}
