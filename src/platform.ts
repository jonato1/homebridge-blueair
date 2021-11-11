import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { BlueAirApi } from './blueair-api';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

import { BlueAirPlatformAccessory } from './platformAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class BlueAirHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  readonly blueair!: BlueAirApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // initializing login information
    this.log = log;

    if(config.username == undefined || config.password == undefined){
      this.log.error('Missing BlueAir API credentials.');
      return;
    }

    this.blueair = new BlueAirApi(this.log, config.username, config.password);

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  
  async discoverDevices() {
    
    // get homehost
    const flag: boolean = await this.blueair.getHomehost();
    if(!flag){
      this.log.error('Failed to retrieve homehost. Be sure username is set.');
      return false;
    }

    // login to BlueAir
    const login_flag: boolean = await this.blueair.login();
    if(!login_flag){
      this.log.error('Failed to login. Check password and restart Homebridge to try again.');
      return false;
    }

    // retrieve devices
    const devices_flag = await this.blueair.getDevices();
    if(!devices_flag){
      this.log.error('Failed to get list of devices. Check BlueAir App.');
      return false;
    }

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.blueair.devices) { 

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.uuid);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        
        // Exclude or include certain openers based on configuration parameters.
        if(!this.optionEnabled(device)) {
          this.log.info('Removing accessory:', device.uuid);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          continue;
        }

        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        this.api.updatePlatformAccessories([existingAccessory]);

        new BlueAirPlatformAccessory(this, existingAccessory);

      } else {
        // the accessory does not yet exist, so we need to create it

        // Exclude or include certain openers based on configuration parameters.
        if(!this.optionEnabled(device)) {
          this.log.info('Skipping accessory:', device.uuid);
          continue;
        }

        this.log.info('Adding new accessory:', device.name);
  
        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);

        accessory.context.uuid = device.uuid;
        accessory.context.mac = device.mac;
        accessory.context.userid = device.userid;

        // create the accessory handler for the newly create accessory
        new BlueAirPlatformAccessory(this, accessory);
        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    // end for
    }

  }

  // Modified from homebridge-myq
  // Utility function to let us know if a BlueAir device should be visible in HomeKit or not.
  private optionEnabled(device, defaultReturnValue = true): boolean {

    // There are a couple of ways to hide and show devices that we support. The rules of the road are:
    //
    // 1. Explicitly hiding, or showing a gateway device propogates to all the devices that are plugged
    //    into that gateway. So if you have multiple gateways but only want one exposed in this plugin,
    //    you may do so by hiding it.
    //
    // 2. Explicitly hiding, or showing an opener device by its serial number will always override the above.
    //    This means that it's possible to hide a gateway, and all the openers that are attached to it, and then
    //    override that behavior on a single opener device that it's connected to.
    //

    // Nothing configured - we show all Kumo devices to HomeKit.
    if(!this.config.options) {
      return defaultReturnValue;
    }

    // We've explicitly enabled this device.
    if(this.config.options.indexOf('Enable.' + device.uuid) !== -1) {
      return true;
    }

    // We've explicitly hidden this opener.
    if(this.config.options.indexOf('Disable.' + device.uuid) !== -1) {
      return false;
    }

    // If we don't have a zoneTable label, we're done here.
    if(!device.name) {
      return true;
    }

    // We've explicitly shown the zoneTabel label this device is attached to.
    if(this.config.options.indexOf('Enable.' + device.name) !== -1) {
      return true;
    }

    // We've explicitly hidden the zoneTable label this device is attached to.
    if(this.config.options.indexOf('Disable.' + device.name) !== -1) {
      return false;
    }

    // Nothing special to do - make this opener visible.
    return defaultReturnValue;
  }
}
