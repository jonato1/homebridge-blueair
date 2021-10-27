import { Logger } from 'homebridge';
export declare class BlueAirApi {
    devices: any;
    private username;
    private password;
    private lastAuthenticateCall;
    private base_API_url;
    private homehost;
    private authToken;
    private log;
    constructor(log: Logger, username: string, password: string);
    getHomehost(): Promise<boolean>;
    login(): Promise<boolean>;
    getDevices(): Promise<boolean>;
    getDeviceAttributes(deviceuuid: string): Promise<any>;
    getDeviceInfo(deviceuuid: string): Promise<any>;
    getDeviceDatapoint(deviceuuid: string): Promise<false | {
        pm: any;
        pm10: any;
        tmp: any;
        hum: any;
        co2: any;
        voc: any;
        allpollu: any;
    }>;
    getDeviceHistory(deviceuuid: string): Promise<false | {
        timestamp: number[];
        pm: number[];
        pm10: number[];
        tmp: number[];
        hum: number[];
        co2: number[];
        voc: number[];
        allpollu: number[];
    }>;
    sendCommand(url_end: string, setValue: string, name: string, deviceuuid: string): Promise<boolean>;
    getJSONfromResponseBody(url: any): Promise<any>;
}
//# sourceMappingURL=blueair-api.d.ts.map