"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlueAirApi = void 0;
const fetch_timeout_1 = __importDefault(require("fetch-timeout"));
const util_1 = __importDefault(require("util"));
const settings_1 = require("./settings");
class BlueAirApi {
    // initiate instance with login information
    constructor(log, username, password) {
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
        try {
            response = await (0, fetch_timeout_1.default)(this.base_API_url, {
                method: 'GET',
                headers: {
                    'X-API-KEY-TOKEN': settings_1.BLUEAIR_APIKEY,
                },
            }, 5000, 'Time out on BlueAir connection.');
        }
        catch (error) {
            this.log.error('BlueAir API: error - %s', error);
            return false;
        }
        let body = await response.text();
        this.homehost = body.replace(/['"]+/g, '');
        this.log.info('Got homehost: %s', this.homehost);
        return true;
    }
    // login
    async login() {
        // Reset the API call time.
        const now = Date.now();
        this.lastAuthenticateCall = now;
        let url = 'https://' + this.homehost + '/v2/user/' + this.username + '/login/';
        let response;
        try {
            response = await (0, fetch_timeout_1.default)(url, {
                method: 'GET',
                headers: {
                    'X-API-KEY-TOKEN': settings_1.BLUEAIR_APIKEY,
                    'Authorization': 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
                },
            }, 5000, 'Time out on BlueAir connection.');
        }
        catch (error) {
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
        let url = 'https://' + this.homehost + '/v2/owner/' + this.username + '/device/';
        let response;
        try {
            response = await (0, fetch_timeout_1.default)(url, {
                method: 'GET',
                headers: {
                    'X-API-KEY-TOKEN': settings_1.BLUEAIR_APIKEY,
                    'X-AUTH-TOKEN': this.authToken
                },
            }, 5000, 'Time out on BlueAir connection.');
        }
        catch (error) {
            this.log.error('BlueAir API: error - %s', error);
            return false;
        }
        let data;
        try {
            data = await response.json();
            this.log.debug(util_1.default.inspect(data, { colors: true, sorted: true, depth: 6 }));
        }
        catch (error) {
            // if cannot parse response
            this.log.error('BlueAir API: error parsing json. %s', data);
            return false;
        }
        this.devices = data;
        this.log.info('Found %s devices.', this.devices.length);
        return true;
    }
    // retrieve per device attributes
    async getDeviceAttributes(deviceuuid) {
        let url = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/attributes/';
        let data = await this.getJSONfromResponseBody(url);
        if (!data) {
            return false;
        }
        let attributes = data.reduce(function (obj, prop) {
            obj[prop.name] = prop.currentValue;
            return obj;
        }, {});
        return attributes;
    }
    // retrieve per device information
    async getDeviceInfo(deviceuuid) {
        let url = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/info/';
        let info = await this.getJSONfromResponseBody(url);
        if (!info) {
            return false;
        }
        return info;
    }
    // retirieve per device datapoint
    async getDeviceDatapoint(deviceuuid) {
        let url = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/datapoint/0/last/0/';
        let data = await this.getJSONfromResponseBody(url);
        if (!data) {
            return false;
        }
        let json = data;
        let pm, pm10, tmp, hum, co2, voc, allpollu;
        for (let i = 0; i < json.sensors.length; i++) {
            switch (json.sensors[i]) {
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
        };
        return measurements;
    }
    // retirieve per device datapoint
    async getDeviceHistory(deviceuuid) {
        const timenow = new Date();
        let timelastmonth = new Date();
        timelastmonth.setMonth(timelastmonth.getMonth() - 1);
        const tsnow = timenow.toISOString();
        const tslastmonth = timelastmonth.toISOString();
        let url = 'https://' + this.homehost + '/v2/device/' + deviceuuid + '/datapoint/' + tslastmonth + '/' + tsnow + '/600/';
        let data = await this.getJSONfromResponseBody(url);
        if (!data) {
            return false;
        }
        //this.log.info(util.inspect(data, { colors: true, sorted: true, depth: 6 }));
        let json = data;
        let timestamp = [];
        let pm = [];
        let pm10 = [];
        let tmp = [];
        let hum = [];
        let co2 = [];
        let voc = [];
        let allpollu = [];
        if (json.datapoints.length >= 1) {
            for (let i = 0; i < json.sensors.length; i++) {
                switch (json.sensors[i]) {
                    case "timestamp":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            timestamp.push(json.datapoints[j][i]);
                        }
                        ;
                        break;
                    case "pm":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            pm.push(json.datapoints[j][i]);
                        }
                        ;
                        break;
                    case "pm10":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            pm10.push(json.datapoints[j][i]);
                        }
                        ;
                        break;
                    case "tmp":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            tmp.push(json.datapoints[j][i]);
                        }
                        ;
                        break;
                    case "hum":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            hum.push(json.datapoints[j][i]);
                        }
                        ;
                        break;
                    case "co2":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            co2.push(json.datapoints[j][i]);
                        }
                        ;
                        break;
                    case "voc":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            voc.push(json.datapoints[j][i]);
                        }
                        ;
                        break;
                    case "allpollu":
                        for (let j = 0; j < json.datapoints.length; j++) {
                            allpollu.push(json.datapoints[j][i]);
                        }
                        ;
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
    async sendCommand(url_end, setValue, name, deviceuuid) {
        //Build POST request body
        var requestbody = {
            "currentValue": setValue,
            "scope": "device",
            "defaultValue": setValue,
            "name": name,
            "uuid": deviceuuid
        };
        const url = 'https://' + this.homehost + '/v2/device/' + url_end;
        let response;
        try {
            response = await (0, fetch_timeout_1.default)(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    'X-API-KEY-TOKEN': settings_1.BLUEAIR_APIKEY,
                    'X-AUTH-TOKEN': this.authToken,
                },
                body: JSON.stringify(requestbody),
            }, 5000, 'Time out on BlueAir connection.');
        }
        catch (error) {
            this.log.error('BlueAir API: error - %s', error);
            return false;
        }
        ;
        const data = await response.json();
        if (response.status !== 200) {
            this.log.warn(util_1.default.inspect(data, { colors: true, sorted: true, depth: 6 }));
            return false;
        }
        return data;
    }
    // function to return body from BlueAir API url using authentication 
    async getJSONfromResponseBody(url) {
        let response;
        try {
            response = await (0, fetch_timeout_1.default)(url, {
                method: 'GET',
                headers: {
                    'X-API-KEY-TOKEN': settings_1.BLUEAIR_APIKEY,
                    'X-AUTH-TOKEN': this.authToken,
                },
            }, 5000, 'Time out on BlueAir connection.');
        }
        catch (error) {
            this.log.error('BlueAir API: error - %s', error);
            return false;
        }
        let data;
        try {
            data = await response.json();
            if (response.status !== 200) {
                this.log.warn(util_1.default.inspect(data, { colors: true, sorted: true, depth: 6 }));
                return false;
            }
        }
        catch (error) {
            // if cannot parse response
            this.log.error('BlueAir API: error parsing json. %s', data);
            return false;
        }
        return data;
    }
}
exports.BlueAirApi = BlueAirApi;
//# sourceMappingURL=blueair-api.js.map