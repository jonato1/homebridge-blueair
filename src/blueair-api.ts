import { Logger } from 'homebridge';
import fetchTimeout from 'fetch-timeout';
import util from 'util';

import {
  BLUEAIR_APIKEY,
  BLUEAIR_AWS_APIKEY,
  BLUEAIR_DEVICE_WAIT,
} from './settings';

export class BlueAirApi {

    devices;
    awsDevices;

    private username: string;
    private password: string;

    private lastAuthenticateCall!: number;
    private base_API_url: string;
    private homehost!: string;
    private authToken!: string;

    // AWS Session Variables
    private sessionToken!: string;
    private sessionSecret!: string;

    // AWS Tokens
    private jwtToken!: string;
    private accessToken!: string;
    private refreshToken!: string;

    // Old AWS Variable(s) - TODO: Confirm if can be deleted
    private authorization!: string;

    private log: Logger;

    // initiate instance with login information
    constructor(log: Logger, username: string, password: string) {
      this.log = log;

      if(username === undefined){
        throw new Error('BlueAir API: no username specified.');
      }

      if(password === undefined){
        throw new Error('BlueAir API: no password specified.');
      }
      this.username = username;
      this.password = password;
      this.devices = [];

      this.base_API_url = 'https://api.blueair.io/v2/user/' + this.username + '/homehost/';
      this.log.info('base_API_url: %s', this.base_API_url);
    }

    // get home host for specified user
    async getHomehost() {
        
      let response;
      try{
        response = await fetchTimeout(this.base_API_url, {
          method: 'GET',
          headers: {
            'X-API-KEY-TOKEN': BLUEAIR_APIKEY,
          },
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir connection.');
      } catch(error) {
        this.log.error('BlueAir API: error - %s', error);
        return false;
      }

      const body: string = await response.text();
      this.homehost = body.replace(/['"]+/g, ''); 
      this.log.info('Got homehost: %s', this.homehost);

      return true;
    }

    // login
    async login() {

      // Reset the API call time.
      const now = Date.now();
      this.lastAuthenticateCall = now;

      const url: string = 'https://' + this.homehost + '/v2/user/' + this.username + '/login/';

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'GET',
          headers: {
            'X-API-KEY-TOKEN': BLUEAIR_APIKEY,
            'Authorization': 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64'),
          },
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir connection.');
      } catch(error) {
        this.log.error('BlueAir API: error - %s', error);
        return false;
      }

      const headers = await response.headers;
      this.authToken = headers.get('x-auth-token');

      if (this.authToken == null){
        this.log.error('BlueAir API: Failed to obtain x-auth-token.');
        return false;
      }
      
      this.log.info('x-auth-token:', this.authToken);
      return true;
    }

    // get devices
    async getDevices() {
      const url: string = 'https://' + this.homehost + '/v2/owner/' + this.username + '/device/';

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'GET',
          headers: {
            'X-API-KEY-TOKEN': BLUEAIR_APIKEY,
            'X-AUTH-TOKEN': this.authToken,
          },
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir connection.');
      } catch(error) {
        this.log.error('BlueAir API: error - %s', error);
        return false;
      }           

      let data;
      try{
        data = await response.json();
        this.log.debug(util.inspect(data, { colors: true, sorted: true, depth: 6 }));
      } catch(error) {
        // if cannot parse response
        this.log.error('BlueAir API: error parsing json. %s', data);
        return false;
      }

      this.devices = data;
      if(this.devices === undefined) {
        this.log.error('No devices found. Response from server below:');
        this.log.info(util.inspect(data, { colors: true, sorted: true, depth: 6 }));
        return false;
      }
      this.log.info('Found %s devices.', this.devices.length);

      return true;
    }

    // retrieve per device attributes
    async getDeviceAttributes(deviceuuid: string) {

      const url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/attributes/';
        
      const data = await this.getJSONfromResponseBody(url);
      if(!data){
        return false;
      }

      const attributes = (data as Array<any>).reduce((obj, prop) => {
        obj[prop.name] = prop.currentValue;
        return obj;         
      }, {});

      return attributes;
    }

    // retrieve per device information
    async getDeviceInfo(deviceuuid: string) {
      const url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/info/';
        
      const info = await this.getJSONfromResponseBody(url);
      if(!info){
        return false;
      }

      return info;
    }

    // retirieve per device datapoint
    async getDeviceDatapoint(deviceuuid: string) {
      const url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/datapoint/0/last/0/';
    
        interface datapoint {
            datapoints,
            end: number,
            sensors: Array<string>,
            start: number,
            units: Array<string>,
            uuid: string,
        }

        const data = await this.getJSONfromResponseBody(url);
        if(!data){
          return false;
        }

        const json: datapoint = data;
        let pm, pm10, tmp, hum, co2, voc, allpollu;
        
        for (let i = 0; i < json.sensors.length; i++) {
          switch(json.sensors[i]) {
            case 'pm':
              pm = json.datapoints[0][i];
              break;

            case 'pm10':
              pm10 = json.datapoints[0][i];
              break;

            case 'tmp':
              tmp = json.datapoints[0][i];
              break;
                
            case 'hum':
              hum = json.datapoints[0][i];
              break;
                
            case 'co2':
              co2 = json.datapoints[0][i];
              break;
                
            case 'voc':
              voc = json.datapoints[0][i];
              break;
                
            case 'allpollu':
              allpollu = json.datapoints[0][i];
              break;
                
            default:
              break;
          }
        }

        const measurements = {
          pm: pm,
          pm10: pm10,
          tmp: tmp,
          hum: hum,
          co2: co2,
          voc: voc,
          allpollu: allpollu,
        };

        return measurements;

    }


    // retirieve per device datapoint
    async getDeviceHistory(deviceuuid: string) {

      const timenow: Date = new Date();
      const timelastmonth: Date = new Date();
      timelastmonth.setMonth(timelastmonth.getMonth() - 1);

      const tsnow = timenow.toISOString();
      const tslastmonth = timelastmonth.toISOString();

      const url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/datapoint/' + tslastmonth + '/' + tsnow + '/600/';
    
        interface datapoint {
            datapoints,
            end: number,
            sensors: Array<string>,
            start: number,
            units: Array<string>,
            uuid: string,
        }

        const data = await this.getJSONfromResponseBody(url);
        if(!data){
          return false;
        }

        //this.log.info(util.inspect(data, { colors: true, sorted: true, depth: 6 }));

        const json: datapoint = data;
        const timestamp: number[] = [];
        const pm: number[] = [];
        const pm10: number[] = [];
        const tmp: number[] = [];
        const hum: number[] = [];
        const co2: number[] = [];
        const voc: number[] = [];
        const allpollu: number[] = [];
        
        if (json.datapoints.length >= 1) {                          
          for (let i = 0; i < json.sensors.length; i++) {
            switch(json.sensors[i]) {
              case 'timestamp':
                for (let j = 0; j < json.datapoints.length; j++){
                  timestamp.push(json.datapoints[j][i]);
                }
                break;

              case 'pm':
                for (let j = 0; j < json.datapoints.length; j++){
                  pm.push(json.datapoints[j][i]);
                }
                break;

              case 'pm10':
                for (let j = 0; j < json.datapoints.length; j++){
                  pm10.push(json.datapoints[j][i]);
                }
                break;

              case 'tmp':
                for (let j = 0; j < json.datapoints.length; j++){
                  tmp.push(json.datapoints[j][i]);
                }
                break;
                    
              case 'hum':
                for (let j = 0; j < json.datapoints.length; j++){
                  hum.push(json.datapoints[j][i]);
                }
                break;
                    
              case 'co2':
                for (let j = 0; j < json.datapoints.length; j++){
                  co2.push(json.datapoints[j][i]);
                }
                break;
                    
              case 'voc':
                for (let j = 0; j < json.datapoints.length; j++){
                  voc.push(json.datapoints[j][i]);
                }
                break;
                    
              case 'allpollu':
                for (let j = 0; j < json.datapoints.length; j++){
                  allpollu.push(json.datapoints[j][i]);
                }
                break;
                    
              default:
                break;
            }
          }


        }

        const measurements = {
          timestamp: timestamp,
          pm: pm,
          pm10: pm10,
          tmp: tmp,
          hum: hum,
          co2: co2,
          voc: voc,
          allpollu: allpollu,
        };

        return measurements;

    }

    // function to send command to BlueAir API url using authentication
    async sendCommand(url_end: string, setValue: string, name: string, deviceuuid: string): Promise<boolean> {
        
      //Build POST request body
      const requestbody = {
        'currentValue': setValue,
        'scope': 'device',
        'defaultValue': setValue,
        'name': name,
        'uuid': deviceuuid,
      };

      const url: string = 'https://' + this.homehost + '/v2/device/' + url_end;

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'X-API-KEY-TOKEN': BLUEAIR_APIKEY,
            'X-AUTH-TOKEN': this.authToken,
          },
          body: JSON.stringify(requestbody),
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir connection.');
      } catch(error) {
        this.log.error('BlueAir API: error - %s', error);
        return false;
      }

      const data = await response.json();
      if(response.status !== 200) {
        this.log.warn(util.inspect(data, { colors: true, sorted: true, depth: 6 }));
        return false;
      }
      return data;

    }

    // function to return body from BlueAir API url using authentication 
    async getJSONfromResponseBody(url) {
      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'GET',
          headers: {
            'X-API-KEY-TOKEN': BLUEAIR_APIKEY,
            'X-AUTH-TOKEN': this.authToken,
          },
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir connection.');
      } catch(error) {
        this.log.error('BlueAir API: error - %s', error);
        return false;
      }

      let data;
      try{
        data = await response.json();
        if(response.status !== 200) {
          this.log.warn(util.inspect(data, { colors: true, sorted: true, depth: 6 }));
          return false;
        }
      } catch(error) {
        // if cannot parse response
        this.log.error('BlueAir API: error parsing json. %s', data);
        return false;
      }

      return data;

    }

    /* AWS Specific Methods */
    // login AWS
    async awsLogin() {

      // Reset the API call time.
      const now = Date.now();
      this.lastAuthenticateCall = now;

      const url = 'https://accounts.us1.gigya.com/accounts.login';

      // details of form to be submitted
      const details = {
        'apikey': BLUEAIR_AWS_APIKEY,
        'loginID': this.username,
        'password': this.password,
        'targetEnv': 'mobile',
      };

      // encode into URL
      const formBody: string[] = [];
      for (const property in details) {
        const encodedKey = encodeURIComponent(property);
        const encodedValue = encodeURIComponent(details[property]);
        formBody.push(encodedKey + '=' + encodedValue);
      }
      const formBody_joined: string = formBody.join('&');

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'POST',
          headers: {
            'Host': 'accounts.us1.gigya.com',
            'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
            'Connection': 'keep-alive',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody_joined,
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
      } catch(error) {
        this.log.error('BlueAir AWS API: error - %s', error);
        return false;
      }

      const headers = await response.headers;
      const data = await response.json();

      this.sessionToken = data.sessionInfo.sessionToken;
      this.sessionSecret = data.sessionInfo.sessionSecret;

      // GET JWT Token

      const jwtUrl = 'https://accounts.us1.gigya.com/accounts.getJWT';

      // details of form to be submitted
      const jwtDetails = {
        'oauth_token': this.sessionToken,
        'secret': this.sessionSecret,
        'targetEnv': 'mobile',
      };

      // encode into URL
      const jwtFormBody: string[] = [];
      for (const jwtProperty in jwtDetails) {
        const encodedKey = encodeURIComponent(jwtProperty);
        const encodedValue = encodeURIComponent(jwtDetails[jwtProperty]);
        jwtFormBody.push(encodedKey + '=' + encodedValue);
      }
      const jwtFormBody_joined: string = jwtFormBody.join('&');

      let jwtResponse;
      try{
        jwtResponse = await fetchTimeout(jwtUrl, {
          method: 'POST',
          headers: {
            'Host': 'accounts.us1.gigya.com',
            'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
            'Connection': 'keep-alive',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: jwtFormBody_joined,
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
      } catch(error) {
        this.log.error('BlueAir AWS API: error - %s', error);
        return false;
      }

      const jwtHeaders = await jwtResponse.headers;
      const jwtData = await jwtResponse.json();

      this.jwtToken = jwtData.id_token;
      //this.authorization = data.UIDSignature;

      // Use JWT Token to get Access Token for Execute API endpoints

      const executeUrl = 'https://on1keymlmh.execute-api.us-east-2.amazonaws.com/prod/c/login';

      let executeResponse;
      try{
        executeResponse = await fetchTimeout(executeUrl, {
          method: 'POST',
          headers: {
            'Host': 'on1keymlmh.execute-api.us-east-2.amazonaws.com',
            'Connection': 'keep-alive',
            'idtoken': this.jwtToken,
            'Accept': '*/*',
            'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
            'Authorization': 'Bearer ' + this.jwtToken,
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
      } catch(error) {
        this.log.error('BlueAir AWS API: error - %s', error);
        return false;
      }

      const executeHeaders = await executeResponse.headers;
      const executeData = await executeResponse.json();

      this.accessToken = executeData.access_token;

      this.log.info('** AWS login begin **');
      /*this.log.info('Headers:', headers);
      this.log.info(util.inspect(data, { colors: true, sorted: true}));
      this.log.info('JWT Headers:', jwtHeaders);
      this.log.info(util.inspect(jwtData, { colors: true, sorted: true}));
      this.log.info('AWS jwtToken: %s', this.jwtToken);
      this.log.info('Execute Headers:', executeHeaders);
      this.log.info(util.inspect(executeData, { colors: true, sorted: true}));
      this.log.info('AWS accessToken: %s', this.accessToken);*/
      //this.log.info('AWS authorization: %s', this.authorization);
      this.log.info('** AWS login end **');

      return true;
    }

    // get devices AWS - does not work
    async getAwsDevices() {
      const url = 'https://on1keymlmh.execute-api.us-east-2.amazonaws.com/prod/c/registered-devices';

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'GET',
          headers: {
            'Host': 'on1keymlmh.execute-api.us-east-2.amazonaws.com',
            'Connection': 'keep-alive',
            'idtoken': this.accessToken,
            'Accept': '*/*',
            'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
            'Authorization': 'Bearer ' + this.accessToken,
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
      } catch(error) {
        this.log.error('BlueAir AWS API: error - %s', error);
        return false;
      }

      let data;
      try{
        data = await response.json();
      } catch(error) {
        // if cannot parse response
        this.log.error('BlueAir AWS API: error parsing json. %s', data);
        return false;
      }

      this.awsDevices = data.devices;

      this.log.info('** AWS devices - begin **');
      this.log.info(util.inspect(data, { colors: true, sorted: true}));
      this.log.info('Found %s devices.', this.awsDevices.length);
      this.log.info('** AWS devices - end **');

      return true;
    }

    // get devices AWS - does not work
    async getAwsDeviceInfo(deviceName: string, deviceUuid: string) {
      let url = 'https://on1keymlmh.execute-api.us-east-2.amazonaws.com/prod/c/' + deviceName + '/r/initial';

      // details of form to be submitted
      let body = JSON.stringify({
        "deviceconfigquery": [
          {
            "id": deviceUuid,
            "r": {
              "r": [
                "sensors"
              ]
            }
          }
        ],
        "includestates": true,
        "eventsubscription": {
          "include": [
            {
              "filter": {
                "o": "= " + deviceUuid
              }
            }
          ]
        }
      });

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'POST',
          headers: {
            'Host': 'on1keymlmh.execute-api.us-east-2.amazonaws.com',
            'Connection': 'keep-alive',
            'idtoken': this.accessToken,
            'Accept': '*/*',
            'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
            'Authorization': 'Bearer ' + this.accessToken,
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
          },
          body: body,
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
      } catch(error) {
        this.log.error('BlueAir AWS API: error - %s', error);
        return false;
      }

      const responseHeaders = await response.headers;
      const responseBody = await response.json();

      /*this.log.info('Response Headers for Initial Call: ', util.inspect(responseHeaders, { colors: true, sorted: true}));
      this.log.info('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo, { colors: true, sorted: true}));
      this.log.info('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0], { colors: true, sorted: true}));
      this.log.info('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0].configuration.di.name, { colors: true, sorted: true}));
      this.log.info('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0].sensordata, { colors: true, sorted: true}));
      this.log.info('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0].states, { colors: true, sorted: true}));*/

      return responseBody.deviceInfo;
    }

    // function to send command to BlueAir API url using authentication
    async setAwsDeviceInfo(deviceUuid: string, service: string, actionVerb: string, actionValue): Promise<boolean> {

      const url = 'https://on1keymlmh.execute-api.us-east-2.amazonaws.com/prod/c/' + deviceUuid + '/a/' + service;

      // details of form to be submitted
      let body;

      if(actionVerb === 'vb') {
          body = JSON.stringify({
            "n": service,
            "vb": actionValue,
          });
      } else {
          body = JSON.stringify({
            "n": service,
            "v": actionValue,
          });
      }

      this.log.debug('Request Body: ', util.inspect(body, { colors: true, sorted: true }));

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'POST',
          headers: {
            'Host': 'on1keymlmh.execute-api.us-east-2.amazonaws.com',
            'Connection': 'keep-alive',
            'idtoken': this.accessToken,
            'Accept': '*/*',
            'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
            'Authorization': 'Bearer ' + this.accessToken,
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
          },
          body: body,
        }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
      } catch(error) {
        this.log.error('BlueAir AWS API: error - %s', error);
        return false;
      }

      const responseHeaders = await response.headers;
      const responseBody = await response.json();

      if(response.status !== 200) {
        this.log.warn(util.inspect(response, { colors: true, sorted: true, depth: 6 }));
        return false;
      }

      this.log.info('Set %s to %s', service, actionValue);

      this.log.debug('Response Headers: ', util.inspect(responseHeaders, { colors: true, sorted: true }));
      this.log.debug('Response Body: ', util.inspect(responseBody, { colors: true, sorted: true }));

      return responseBody;

    }

}

