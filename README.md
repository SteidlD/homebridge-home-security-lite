# homebridge-home-security-lite
A homebridge-plugin for using your available homekit sensors and actors to build a security system.

### Features:
- include door and window sensors
- get reminded of opened windows after a configurable time
- get reminded of opened windows when leaving your home
- get an alarm if a window or door is opened when security system is armed

## Installation:

### 1. Install homebridge and home-security-lite plugin.
- 1.a `sudo npm install -g homebridge --unsafe-perm`
- 1.b `sudo npm install -g homebridge-home-security-lite`

### 2. Update homebridge configuration file.
```
"platforms": [
   {
      "platform"    : "HomeSecurityLite",
      "name"        : "HomeSecurityLite",
      "plugin_map"  :
      {
         "plugin_name" : "homebridge-home-security-lite"
      },
      "prefix_remind_me"           : "Remind me of",
      "prefix_reminder"            : "Reminder:",
      "prefix_reminder_accessory"  : "Remind timer",
      "forgot_window_warning_name" : "Forgot open window or door",
      "home_security_lite_name"    : "Home Security Lite",
      "security_system_name"       : "Security system",
      "fast_cyclic_reminder_name"  : "Remind me fast again",
      "windows_and_doors"          :
      [
         {
            "name"               : "bathroom window",
            "description"        : "input/output for the window contact sensor in the bathroom"
         },
         {
            "name"               : "patio door",
            "first_remind"       : 1200,
            "fast_cyclic_remind" : 180,
            "slow_cyclic_remind" : 43200
         }
      ],
      "first_remind"       : 900,
      "fast_cyclic_remind" : 120,
      "slow_cyclic_remind" : 1800
   }
]
```
