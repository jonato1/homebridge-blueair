import { Logger } from 'homebridge';
import fetchTimeout from 'fetch-timeout';
import util from 'util';

import {
	BLUEAIR_APIKEY,
} from './settings';

export class BlueAirApi {

	devices;

	private username: string;
	private password: string;

	private lastAuthenticateCall!: number;
	private base_API_url: string;
	private homehost!: string;
	private authToken!: string;

	private log: Logger;

	// initiate instance with login information
	constructor(log: Logger, username: string, password: string) {
		this.log = log;
		this.username = username;
		this.password = password;
		this.devices = [];

		this.base_API_url = "https://api.blueair.io/v2/user/" + this.username + "/homehost/";
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
	      		}, 5000, 'Time out on BlueAir connection.');
	    } catch(error) {
	      this.log.error('BlueAir API: error - %s', error);
	      return false;
	    }

	    let body: string = await response.text();
	    this.homehost = body.replace(/['"]+/g, ''); 
	    this.log.info('Got homehost: %s', this.homehost)

	    return true;
	}

	// login
	async login() {

		// Reset the API call time.
		const now = Date.now();
		this.lastAuthenticateCall = now;

		let url: string = 'https://' + this.homehost + '/v2/user/' + this.username + '/login/';

		let response;
		try{
			response = await fetchTimeout(url, {
	        	method: 'GET',
	        	headers: {
	        		'X-API-KEY-TOKEN': BLUEAIR_APIKEY,
	        		'Authorization': 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
	        		},
	      		}, 5000, 'Time out on BlueAir connection.');
	    } catch(error) {
	      this.log.error('BlueAir API: error - %s', error);
	      return false;
	    }

	    let headers = await response.headers;
	    this.authToken = headers.get('x-auth-token');
	    this.log.info('x-auth-token:', this.authToken);

	    return true;
	}

	// get devices
	async getDevices() {
		let url: string = 'https://' + this.homehost + '/v2/owner/' + this.username + '/device/';

		let response;
		try{
			response = await fetchTimeout(url, {
	        	method: 'GET',
	        	headers: {
	    					'X-API-KEY-TOKEN': BLUEAIR_APIKEY,
	    					'X-AUTH-TOKEN': this.authToken
	    				},
	    	}, 5000, 'Time out on BlueAir connection.');
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
    	this.log.info('Found %s devices.', this.devices.length);

    	return true;
	}

	// retrieve per device attributes
	async getDeviceAttributes(deviceuuid: string) {

		let url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/attributes/';
		
		let data: any = await this.getJSONfromResponseBody(url);
		if(!data){
			return false;
		}

		let attributes = (data as Array<any>).reduce(function(obj, prop) {
			obj[prop.name] = prop.currentValue;
			return obj;			
		}, {});

		return attributes;
    }

    // retrieve per device information
    async getDeviceInfo(deviceuuid: string) {
    	let url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/info/';
		
		let info: any = await this.getJSONfromResponseBody(url);
		if(!info){
			return false;
		}

		return info;
    }

    // retirieve per device datapoint
    async getDeviceDatapoint(deviceuuid: string) {
    	let url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/datapoint/0/last/0/';
	
		interface datapoint {
			datapoints,
			end: number,
			sensors: Array<string>,
			start: number,
			units: Array<string>,
			uuid: string,
		}

		let data: any = await this.getJSONfromResponseBody(url);
		if(!data){
			return false;
		}

		let json: datapoint = data;
		let pm, pm10, tmp, hum, co2, voc, allpollu;
		
		for (let i = 0; i < json.sensors.length; i++) {
			switch(json.sensors[i]) {
				case "pm":
					pm = json.datapoints[0][i];
				break;

				case "pm10":
					pm10 = json.datapoints[0][i];
				break;

				case "tmp":
					tmp = json.datapoints[0][i];
				break;
				
				case "hum":
					hum = json.datapoints[0][i];
				break;
				
				case "co2":
					co2 = json.datapoints[0][i];
				break;
				
				case "voc":
					voc = json.datapoints[0][i];
				break;
				
				case "allpollu":
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
		}

		return measurements;

    }


    // retirieve per device datapoint
    async getDeviceHistory(deviceuuid: string) {

    	const timenow: Date = new Date();
    	let timelastmonth: Date = new Date();
    	timelastmonth.setMonth(timelastmonth.getMonth() - 1);

    	const tsnow = timenow.toISOString();
    	const tslastmonth = timelastmonth.toISOString();

    	let url: string = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/datapoint/' + tslastmonth + '/' + tsnow + '/600/';
	
		interface datapoint {
			datapoints,
			end: number,
			sensors: Array<string>,
			start: number,
			units: Array<string>,
			uuid: string,
		}

		let data: any = await this.getJSONfromResponseBody(url);
		if(!data){
			return false;
		}

		//this.log.info(util.inspect(data, { colors: true, sorted: true, depth: 6 }));

		let json: datapoint = data;
		let timestamp: number[] = [];
		let pm: number[] = [];
		let pm10: number[] = [];
		let tmp: number[] = [];
		let hum: number[] = [];
		let co2: number[] = [];
		let voc: number[] = [];
		let allpollu: number[] = [];
		
		if (json.datapoints.length >= 1) {							
			for (let i = 0; i < json.sensors.length; i++) {
				switch(json.sensors[i]) {
					case "timestamp":
						for (let j = 0; j < json.datapoints.length; j++){
							timestamp.push(json.datapoints[j][i]);
						};
					break;

					case "pm":
						for (let j = 0; j < json.datapoints.length; j++){
							pm.push(json.datapoints[j][i]);
						};
					break;

					case "pm10":
						for (let j = 0; j < json.datapoints.length; j++){
							pm10.push(json.datapoints[j][i]);
						};
					break;

					case "tmp":
						for (let j = 0; j < json.datapoints.length; j++){
							tmp.push(json.datapoints[j][i]);
						};
					break;
					
					case "hum":
						for (let j = 0; j < json.datapoints.length; j++){
							hum.push(json.datapoints[j][i]);
						};
					break;
					
					case "co2":
						for (let j = 0; j < json.datapoints.length; j++){
							co2.push(json.datapoints[j][i]);
						};
					break;
					
					case "voc":
						for (let j = 0; j < json.datapoints.length; j++){
							voc.push(json.datapoints[j][i]);
						};
					break;
					
					case "allpollu":
						for (let j = 0; j < json.datapoints.length; j++){
							allpollu.push(json.datapoints[j][i]);
						};
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
		}

		return measurements;

    }

    // function to send command to BlueAir API url using authentication
    async sendCommand(url_end: string, setValue: string, name: string, deviceuuid: string): Promise<boolean> {
		
		//Build POST request body
		var requestbody = {
			"currentValue": setValue,
			"scope": "device",
			"defaultValue": setValue,
			"name": name,
			"uuid": deviceuuid
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
	    	}, 5000, 'Time out on BlueAir connection.');
	    } catch(error) {
	      this.log.error('BlueAir API: error - %s', error);
	      return false;
	    };

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
	    	}, 5000, 'Time out on BlueAir connection.');
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

