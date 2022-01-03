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

    private username: string;
    private password: string;

    private lastAuthenticateCall!: number;
    private base_API_url: string;
    private homehost!: string;
    private authToken!: string;

    // AWS
    private idtoken!: string;
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

    // login AWS
    async loginAWS() {

      // Reset the API call time.
      const now = Date.now();
      this.lastAuthenticateCall = now;

      const url = 'https://accounts.us1.gigya.com/accounts.login';

      // details of form to be submitted
      const details = {
        'apikey': BLUEAIR_AWS_APIKEY,
        'context': this.username,
        'format': 'json',
        'gmid': 'gmid.ver4.AcbH1t5dtQ.5lNyeRTZx_2tix9_CmkPET0LEKzlZj3aCQKDGgQFPAQbhtIofo_8zt1qF1rGI3rv.x2GCFpIfGXRZCwYU9j9H-Y9QDUW2K0W3-EvUgowRvyeHm4ztNDo3va17ftl263VkgXcfxLfOBvpcWPLy732UoA.sc3',
        'httpStatusCodes': 'false',
        'include': 'profile,data,emails,subscriptions,preferences,',
        'includeUserInfo': 'true',
        'lang': 'en-US',
        'loginID': this.username,
        'loginMode': 'standard',
        'nonce': '1640811370_129463292',
        'password': this.password,
        'riskContext': '{"b0":40990,"b2":2,"b4":2,"b5":1}',
        'sdk': 'ios_swift_1.2.2',
        'sessionExpiration': '0',
        'source': 'showScreenSet',
        'targetEnv': 'mobile',
        'ucid': '5vRhzJ1VY4Q4xYlCcXCTtA',     
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
            'Content-Length': '754',
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
      this.log.info('Headers:', headers);

      const data = await response.json();
      this.log.info(util.inspect(data, { colors: true, sorted: true, depth: 6 }));

      this.idtoken = data.UID;
      this.authorization = data.UIDSignature;

      this.log.info('AWS idtoken: %s', this.idtoken);
      this.log.info('AWS authorization: %s', this.authorization);
      
      return true;
    }

    // get devices AWS - does not work
    async getDevicesAWS() {
      const url = 'https://on1keymlmh.execute-api.us-east-2.amazonaws.com/prod/c/registered-devices';

      let response;
      try{
        response = await fetchTimeout(url, {
          method: 'GET',
          headers: {
            'Host': 'on1keymlmh.execute-api.us-east-2.amazonaws.com',
            'Connection': 'keep-alive',
            'idtoken': this.idtoken,
            'Accept': '*/*',
            'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
            'Authorization': 'Bearer ' + this.authorization,
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
        this.log.info(util.inspect(data, { colors: true, sorted: true, depth: 6 }));
      } catch(error) {
        // if cannot parse response
        this.log.error('BlueAir AWS API: error parsing json. %s', data);
        return false;
      }      

      //this.devices = data;
      //this.log.info('Found %s devices.', this.devices.length);

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

}

