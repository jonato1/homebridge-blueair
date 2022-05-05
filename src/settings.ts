/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'BlueAir';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = '@fjs21/homebridge-blueair';

export const BLUEAIR_APIKEY = 'eyJhbGciOiJIUzI1NiJ9.eyJncmFudGVlIjoiYmx1ZWFpciIsImlhdCI6MTQ1MzEyNTYzMiwidmFsaWRpdHkiOi0xLCJqdGkiOiJkNmY3OGE0Yi1iMWNkLTRkZDgtOTA2Yi1kN2JkNzM0MTQ2NzQiLCJwZXJtaXNzaW9ucyI6WyJhbGwiXSwicXVvdGEiOi0xLCJyYXRlTGltaXQiOi0xfQ.CJsfWVzFKKDDA6rWdh-hjVVVE9S3d6Hu9BzXG9htWFw';

export const BLUEAIR_DEVICE_WAIT = 5000;

export const BLUEAIR_LOGIN_WAIT = 86400000; // 24 hours

export const BLUEAIR_AWS_APIKEYS = {
  'us': {
    'gigyaRegion': 'us1',
    'restApiId': 'on1keymlmh',
    'awsRegion': 'us-east-2',
    'apiKey': '3_-xUbbrIY8QCbHDWQs1tLXE-CZBQ50SGElcOY5hF1euE11wCoIlNbjMGAFQ6UwhMY',
  },
  'eu': {
    'gigyaRegion': 'eu1',
    'restApiId': 'hkgmr8v960',
    'awsRegion': 'eu-west-1',
    'apiKey': '3_qRseYzrUJl1VyxvSJANalu_kNgQ83swB1B9uzgms58--5w1ClVNmrFdsDnWVQQCl',
  }
};

