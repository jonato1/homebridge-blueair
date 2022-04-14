import { Service, PlatformAccessory } from 'homebridge';

import fakegato from 'fakegato-history';

import { BlueAirHomebridgePlatform } from './platform';

import { BLUEAIR_DEVICE_WAIT } from './settings';

export class BlueAirDustProtectAccessory {
  // setup device services
  private AirPurifier: Service;
  private AirQualitySensor: Service;
  private FilterMaintenance: Service;
  private Lightbulb: Service;
  private NightMode: Service;
  private GermShield: Service;

  // store last query to BlueAir API
  private lastquery;

  // setup fake-gato history service for Eve support
  private historyService: fakegato.FakeGatoHistoryService;

  constructor(
    private readonly platform: BlueAirHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set model name, firware, etc.
    this.setAccessoryInformation();

    this.platform.log.info('Accessor object', this.accessory);

    // initiate services
    this.AirPurifier = this.accessory.getService(this.platform.Service.AirPurifier) || 
      this.accessory.addService(this.platform.Service.AirPurifier);
    this.AirQualitySensor = this.accessory.getService(this.platform.Service.AirQualitySensor) ||
      this.accessory.addService(this.platform.Service.AirQualitySensor);
    this.FilterMaintenance = this.accessory.getService(this.platform.Service.FilterMaintenance) ||
      this.accessory.addService(this.platform.Service.FilterMaintenance);
    this.Lightbulb = this.accessory.getService(this.platform.Service.Lightbulb) || 
      this.accessory.addService(this.platform.Service.Lightbulb);
    this.NightMode = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);
    this.GermShield = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);
    
    // create handlers for characteristics
    this.AirPurifier.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleAirPurifierActiveGet.bind(this))
      .onSet(this.handleAirPurifierActiveSet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .onGet(this.handleCurrentAirPurifierStateGet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .onGet(this.handleTargetAirPurifierGet.bind(this))
      .onSet(this.handleTargetAirPurifierSet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.LockPhysicalControls)
      .onGet(this.handleLockPhysicalControlsGet.bind(this))
      .onSet(this.handleLockPhysicalControlsSet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.handleRotationSpeedGet.bind(this))
      .onSet(this.handleRotationSpeedSet.bind(this));

    this.AirQualitySensor.getCharacteristic(this.platform.Characteristic.PM2_5Density)
      .onGet(this.handlePM25DensityGet.bind(this));

    this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
      .onGet(this.handleFilterChangeGet.bind(this));

    this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
      .onGet(this.handleFilterLifeLevelGet.bind(this));

    this.Lightbulb.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      .onSet(this.handleOnSet.bind(this));

    this.Lightbulb.getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(this.handleBrightnessGet.bind(this))
      .onSet(this.handleBrightnessSet.bind(this));

    this.NightMode.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleNightModeGet.bind(this))
      .onSet(this.handleNightModeSet.bind(this));

    this.NightMode.getCharacteristic(this.platform.Characteristic.Name)
      .onGet(this.handleNightModeNameGet.bind(this));

    // Only set up GermProtect on HealthProtect models
    if(this.accessory.context.configuration.di.hw == 'high_1.5') {
        this.GermShield.getCharacteristic(this.platform.Characteristic.On)
          .onGet(this.handleGermShieldGet.bind(this))
          .onSet(this.handleGermShieldSet.bind(this));

        this.GermShield.getCharacteristic(this.platform.Characteristic.Name)
          .onGet(this.handleGermShieldNameGet.bind(this));
    }

  }

  async setAccessoryInformation() {
    // setup information for each accessory

    await this.updateDevice();

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'BlueAir')
      .setCharacteristic(this.platform.Characteristic.Model, 'DustProtect')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.configuration.di.ds)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.configuration.di.mfv);

  }
 
  async updateDevice() {
    // update accessory.context with latest values from BlueAir

    if ((Date.now() - BLUEAIR_DEVICE_WAIT) < this.lastquery) {
      //this.platform.log.debug('Recent update from device already performed.');
      if(!this.accessory.context.attributes) {
        this.platform.log.error('%s: accessory context not set', this.accessory.displayName);
        return false;
      }
      //this.platform.log.debug('%s: using old data', this.accessory.displayName);
      return true; //ok to use current data in context to update Characteristic values
    }
    this.lastquery = Date.now(); // update time of last query

    try{
      this.platform.log.debug('Accessory Info: ', this.accessory);
      this.platform.log.debug('Accessory Name: ', this.accessory.context.deviceApiName);
      this.platform.log.debug('Accessory UUID: ', this.accessory.context.uuid);
      const info = await this.platform.blueair.getAwsDeviceInfo(this.accessory.context.deviceApiName, this.accessory.context.uuid);
      if(!info){
        this.platform.log.error('%s: getDeviceInfo failed.', this.accessory.displayName);
        return false;
      }

      this.accessory.context.configuration = info[0].configuration;
      this.accessory.context.sensorData = info[0].sensorData;

      const sensorData = {};
      for (let i=0; i < info[0].sensordata.length; i++) {
          const events = info[0].sensordata[i];

          this.platform.log.info('Accessory Sensor #', i);
          this.platform.log.info('Accessory Sensor', info[0].sensordata[i]);
          if (Object.prototype.hasOwnProperty.call(events, 'v')) {
            sensorData[info[0].sensordata[i].n] = info[0].sensordata[i].v;
          } else if (Object.prototype.hasOwnProperty.call(events, 'vb')) {
            sensorData[info[0].sensordata[i].n] = info[0].sensordata[i].vb;
          }
      }

      const attributes = {};
      for (let i=0; i < info[0].states.length; i++) {
          const events = info[0].states[i];

          this.platform.log.info('Accessory State #', i);
          this.platform.log.info('Accessory State', info[0].states[i]);
          if (Object.prototype.hasOwnProperty.call(events, 'v')) {
              attributes[info[0].states[i].n] = info[0].states[i].v;
          } else if (Object.prototype.hasOwnProperty.call(events, 'vb')) {
              attributes[info[0].states[i].n] = info[0].states[i].vb;
          }
      }

      this.accessory.context.sensorData = sensorData;
      this.accessory.context.attributes = attributes;
      this.platform.log.debug('Accessory object from updateDevice(): ', this.accessory);

      // Update Device Display Name
      this.accessory.displayName = this.accessory.context.configuration.di.name;
    } catch(error) {
      this.platform.log.error('%s: getDeviceInfo error. %s', this.accessory.displayName, error);
      return false;
    }

    //this.accessory.context.info.filterlevel = 100 - 0;
    //this.platform.log.info('%s: Filter life left %s', this.accessory.displayName, this.accessory.context.info.filterlevel);

    return true;
  }

  // handlers GET

  async handleAirPurifierActiveGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.Active).value;
  }

  async handleCurrentAirPurifierStateGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState).value;
  }

  async handleTargetAirPurifierGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState).value;
  }

  async handleLockPhysicalControlsGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.LockPhysicalControls).value;
  }

  async handleRotationSpeedGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.RotationSpeed).value;
  }

  async handlePM25DensityGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirQualitySensor.getCharacteristic(this.platform.Characteristic.PM2_5Density).value;
  }

  async handleFilterChangeGet() {
    await this.updateAccessoryCharacteristics();
    return this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterChangeIndication).value;
  }

  async handleFilterLifeLevelGet() {
    await this.updateAccessoryCharacteristics();
    return this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterLifeLevel).value;
  }

  async handleOnGet() {
    await this.updateAccessoryCharacteristics();
    return this.Lightbulb.getCharacteristic(this.platform.Characteristic.On).value;
  }

  async handleBrightnessGet() {
    await this.updateAccessoryCharacteristics();
    return this.Lightbulb.getCharacteristic(this.platform.Characteristic.Brightness).value;
  }

  async handleNightModeGet() {
    await this.updateAccessoryCharacteristics();
    return this.NightMode.getCharacteristic(this.platform.Characteristic.On).value;
  }

  async handleNightModeNameGet() {
    return this.accessory.context.configuration.di.name + ' - Night Mode';
  }

  async handleGermShieldGet() {
    await this.updateAccessoryCharacteristics();
    return this.GermShield.getCharacteristic(this.platform.Characteristic.On).value;
  }

  async handleGermShieldNameGet() {
    return this.accessory.context.configuration.di.name + ' - Germ Shield';
  }
 
  // common function to update all characteristics
  async updateAccessoryCharacteristics() {
    // updateAccessoryCharacteristics

    // update context.device information from Kumo or Directly
    const status: boolean = await this.updateDevice();
    if(!status) { 
      this.platform.log.info('updateAccessoryCharacteristic failed (%s)', this.accessory.context.uuid);
      return false;
    }

    // update characteristics from this.accessory.context
    await this.updateAirPurifierActiveState();
    await this.updateAirPurifierCurrentAirPurifierState();
    await this.updateAirPurifierTargetAirPurifierState();
    await this.updateAirPurifierLockPhysicalControl();
    await this.updateAirPurifierRotationSpeed();
    await this.updateAirQualitySensor();
    await this.updateFilterMaintenance();
    await this.updateLED();
    await this.updateNightMode();
    if(this.accessory.context.configuration.di.hw == 'high_1.5') {
        await this.updateGermShield();
    }

    return true;
  }

  async updateAirPurifierActiveState() {
    // AirPurifier Active

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.Active).value;
    
    if(this.accessory.context.attributes.standby){
      currentValue = this.platform.Characteristic.Active.INACTIVE;
    } else if (!this.accessory.context.attributes.standby) {
      currentValue = this.platform.Characteristic.Active.ACTIVE;
    } else {
      this.platform.log.error('%s: failed to determine active state.', this.accessory.displayName);
      return false;
    }

    this.platform.log.debug('%s: Active is %s', this.accessory.displayName, currentValue);
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.Active, currentValue);
    return true;
  }

  async updateAirPurifierCurrentAirPurifierState() {
    // AirPurifier Current State

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState).value;
    
    if(!this.accessory.context.attributes.standby){
      currentValue = this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
    } else {
      currentValue = this.platform.Characteristic.CurrentAirPurifierState.INACTIVE;
    }

    this.platform.log.debug('%s: CurrentState is %s', this.accessory.displayName, currentValue);
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, currentValue);
    return true;
  }

  async updateAirPurifierTargetAirPurifierState() {
    // AirPurifier Target State

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState).value;
    
    if(this.accessory.context.attributes.automode){
      currentValue = this.platform.Characteristic.TargetAirPurifierState.AUTO;
    } else if (!this.accessory.context.attributes.automode){
      currentValue = this.platform.Characteristic.TargetAirPurifierState.MANUAL;
    }

    this.platform.log.debug('%s: TargetState is %s', this.accessory.displayName, currentValue); 
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.TargetAirPurifierState, currentValue);
    return true;
  }

  async updateAirPurifierLockPhysicalControl() {
    // AirPurifier Physical Control

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.LockPhysicalControls).value;
    
    if(this.accessory.context.attributes.childlock){
      currentValue = this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED;
    } else {
      currentValue = this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
    }

    this.platform.log.debug('%s: LockPhysicalControl is %s', this.accessory.displayName, currentValue); 
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.LockPhysicalControls, currentValue);
    return true;
  }

  async updateAirPurifierRotationSpeed() {
    // AirPurifier Rotation Speed

    const fan_speed: number = this.accessory.context.attributes.fanspeed;
    this.platform.log.debug('%s: fan_speed is %s', this.accessory.displayName, fan_speed);

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.RotationSpeed).value;
    if (fan_speed !== undefined) {
      currentValue = fan_speed;
    } else {
      // rotation speed not reported from device
      return false;
    }

    this.platform.log.debug('%s: RotationsSpeed is %s', this.accessory.displayName, currentValue); 
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.RotationSpeed, currentValue);
    return true;
  }

  async updateAirQualitySensor() {
    // Update AirQuality measurements
    if(this.accessory.context.sensorData !== undefined) {
      this.platform.log.debug('Sensor Data: ', this.accessory.context.sensorData);
      // Characteristic triggers warning if value over 1000
      if(this.accessory.context.sensorData.pm2_5 !== undefined){
        this.AirQualitySensor.updateCharacteristic(this.platform.Characteristic.PM2_5Density, this.accessory.context.sensorData.pm2_5);
        this.AirPurifier.updateCharacteristic(this.platform.Characteristic.PM2_5Density, this.accessory.context.sensorData.pm2_5);
        this.platform.log.debug('Sensor Data - PM 2.5: ', this.accessory.context.sensorData.pm2_5);
      }

      // Used 2.5 levels from https://blissair.com/what-is-pm-2-5.htm
      const levels = [
        [99999, 201, 5], // 5 = this.platform.Characteristic.AirQuality.POOR
        [200, 151, 4], // 4 = this.platform.Characteristic.AirQuality.INFERIOR
        [150, 101, 3], //  3 = this.platform.Characteristic.AirQuality.FAIR
        [100, 51, 2], // 2 = this.platform.Characteristic.AirQuality.GOOD
        [50, 0, 1], // 1 = this.platform.Characteristic.AirQuality.EXCELLENT
      ];

      const ppm = this.accessory.context.sensorData.pm2_5;

      let AirQuality;
      for(const item of levels){
        if(ppm >= item[1] && ppm <= item[0]){
          AirQuality = item[2];
        }
      }
      //this.platform.log.debug('%s: AirQuality = %s', this.accessory.displayName, AirQuality);

      this.AirQualitySensor.updateCharacteristic(this.platform.Characteristic.AirQuality, AirQuality);
      this.AirPurifier.updateCharacteristic(this.platform.Characteristic.AirQuality, AirQuality);
    }
  }

  async updateFilterMaintenance() {
    // Update Filter maintenance
    if(this.accessory.context.attributes.filterusage !== undefined) {
      let currentValue;
      if(this.accessory.context.attributes.filterusage < 95){
        currentValue = this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
      } else {
        currentValue = this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER;
      }
      this.FilterMaintenance.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, currentValue);
    } else {
      this.platform.log.error('%s: no filter_status found.', this.accessory.displayName);
      return false;
    }

    if(this.accessory.context.attributes.filterusage !== undefined) {
      if(this.accessory.context.attributes.filterusage > 0) {
        this.FilterMaintenance.updateCharacteristic(this.platform.Characteristic.FilterLifeLevel, this.accessory.context.attributes.filterusage);
      } else {
        this.FilterMaintenance.updateCharacteristic(this.platform.Characteristic.FilterLifeLevel, 0);
      }
    } else {
      this.platform.log.error('%s: no filterlife found.', this.accessory.displayName);
      return false;
    }

    return true;
  }

  async updateLED() {
    // Check to see if the air purifier is Off (Standby = True); If so, set LED to Off
    if(this.accessory.context.attributes.standby) {
        this.Lightbulb.updateCharacteristic(this.platform.Characteristic.On, 0);
        return true;
    }

    // get LED state & brigtness
    if(this.accessory.context.attributes.brightness !== undefined) {
      if(this.accessory.context.attributes.brightness > 0) {
        this.Lightbulb.updateCharacteristic(this.platform.Characteristic.On, 1);  
      } else {
        this.Lightbulb.updateCharacteristic(this.platform.Characteristic.On, 0);  
      }

      this.Lightbulb.updateCharacteristic(this.platform.Characteristic.Brightness, this.accessory.context.attributes.brightness);
    }
  }

  async updateNightMode() {
    // Check to see if the air purifier is Off (Standby = True); If so, set LED to Off
    if(this.accessory.context.attributes.standby) {
      this.NightMode.updateCharacteristic(this.platform.Characteristic.On, 0);
      return true;
    }

    // get NightMode Status
    if(this.accessory.context.attributes.nightmode !== undefined) {
      if(this.accessory.context.attributes.nightmode) {
        this.NightMode.updateCharacteristic(this.platform.Characteristic.On, 1);
      } else {
        this.NightMode.updateCharacteristic(this.platform.Characteristic.On, 0);
      }
    }
  }

  async updateGermShield() {
    // Check to see if the air purifier is Off (Standby = True); If so, set LED to Off
    if(this.accessory.context.attributes.standby) {
      this.GermShield.updateCharacteristic(this.platform.Characteristic.On, 0);
      return true;
    }

    // get NightMode Status
    if(this.accessory.context.attributes.germshield !== undefined) {
      if(this.accessory.context.attributes.germshield) {
        this.GermShield.updateCharacteristic(this.platform.Characteristic.On, 1);
      } else {
        this.GermShield.updateCharacteristic(this.platform.Characteristic.On, 0);
      }
    }
  }

  // handlers SET

  async handleAirPurifierActiveSet(state) {
    // Set AirPurifier state
    if (state === 1) {
      // Set fan to auto when turned on
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'standby', 'vb', false);
    } else if (state === 0) {
      // Set fan speed to 0 when turned off
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'standby', 'vb', true);
    }
  }

  async handleTargetAirPurifierSet(state) {
    // Set fan to auto turned on without a speed set
    if(state === 0){ // Manual
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'automode', 'vb', false);
    } else if (state === 1){ // Auto
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'automode', 'vb', true);
    }
  }

  async handleLockPhysicalControlsSet(state) {
    // Set child lock state

    if(state === 0){ // Child Lock Unlocked
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'childlock', 'vb', false);
    } else if (state === 1){ // Child Lock Locked
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'childlock', 'vb', true);
    }
  }

  async handleRotationSpeedSet(value) {
    // Set fan rotation speed  
    await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'fanspeed', 'v', value);
  }

  async handleOnSet(state) {
    // Set LightBulb on

    let brightness;
    if(state === true) {
      brightness = this.accessory.context.attributes.brightness;
    } else if (state === false) {
      brightness = 0;
    }

    await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'brightness', 'v', brightness);
  }

  async handleBrightnessSet(value) {
    // Set LightBulb brightness
    await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'brightness', 'v', value);
  }

  async handleNightModeSet(state) {
    this.platform.log.debug('handleNightModeSet state: ', state);

    // Set NightMode
    if(state === false){ // Night Mode Off
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'nightmode', 'vb', false);
    } else if (state === true){ // Night Mode On
      // If Air Purifier is turned off, first turn it on
      if(this.accessory.context.attributes.standby) {
        // Set fan to auto when turned on
        await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'standby', 'vb', false);
      }
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'nightmode', 'vb', true);
    }
  }

  async handleGermShieldSet(state) {
    this.platform.log.debug('handleGermShieldSet state: ', state);

    // Set GermShield
    if(state === false){ // Germ Shield Off
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'germshield', 'vb', false);
    } else if (state === true){ // Night Mode On
      // If Air Purifier is turned off, first turn it on
      if(this.accessory.context.attributes.standby) {
        // Set fan to auto when turned on
        await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'standby', 'vb', false);
      }
      await this.platform.blueair.setAwsDeviceInfo(this.accessory.context.uuid, 'germshield', 'vb', true);
    }
  }

}


