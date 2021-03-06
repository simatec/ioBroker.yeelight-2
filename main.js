/**
 * 
 * yeelight adapter
 *
 *
 */
'use strict';

// you have to require the utils module and call adapter function
var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var net = require('net');
var yeelight = require(__dirname + '/lib/yeelight');
var scenen = require(__dirname + '/lib/scenen');
var adapter = new utils.Adapter('yeelight-2');
var objects = {};
var devices = [];
var sockets = {};
var sel_devices = [];
var ready = false;
var modeVal = 0;
var bright_selector;
var bright_modi = ["active_bright", "bright"]


var PARAMETERLIST = [
    'power',
    'active_bright',
    'ct',
    'rgb',
    'active_mode',
    'color_mode',
    'bright',
    'hue',
    'sat',
    'flowing',
    'main_power',
    'bg_power',
    'bg_color_mode',
    'bg_bright',
    'bg_hue',
    'bg_sat',
    'bg_rgb',
    'bg_ct'
];

adapter.on('unload', function (callback) {
    sockets = null;
    yeelight.stopDiscovering();

});

adapter.on('stateChange', function (id, state) {
    if (state && !state.ack) {
        var changeState = id.split('.');
        var sid = adapter.namespace + '.' + changeState[2];
        adapter.log.debug(JSON.stringify(changeState))
        adapter.getState(sid + '.info.IPAdress', function (err, data) {
            if (err) {
                adapter.log.error(err);
            } else {
                if (changeState[3] != 'info' && changeState[4] !== 'scenen') {
                    if (!state.ack) {
                        adapter.getState(sid + '.info.Port', function (err, data2) {
                            if (err) {
                                adapter.log.error(err);
                            } else {
                                uploadState(sid + '.' + changeState[3], data.val, data2.val, changeState[4], state.val);
                            }
                        });

                    }
                } else if (changeState[3] != 'info' && changeState[4] === 'scenen') {
                    if (!state.ack) {
                        adapter.getState(sid + '.info.Port', function (err, data2) {
                            if (err) {
                                adapter.log.error(err);
                            } else {
                                //uploadState(sid + '.' + changeState[3], data.val, data2.val, changeState[4], state.val);
                                _sendscene(sid + '.' + changeState[3], data.val, data2.val, changeState[5], state.val)
                            }
                        });

                    }
                }
            }
        })
    }
});

adapter.on('ready', function () {
    main();
    adapter.log.debug('from_conf: ' + JSON.stringify(adapter.config));
    sel_devices = adapter.config.devices;
});

adapter.on('message', function (obj) {

    //yeelight.stopDiscovering();
    adapter.log.debug('here is a Message' + JSON.stringify(obj));

    if (!obj) return;

    function reply(result) {
        adapter.sendTo(obj.from, obj.command, JSON.stringify(result), obj.callback);
    }

    switch (obj.command) {
        case 'discovery':
            var onlyActive, reread;
            var deviceDiscovered = [];
            sockets = null;
            yeelight.stopDiscovering();


            if (typeof obj.message === 'object') {
                //onlyActive = obj.message.onlyActive;
                //reread = obj.message.reread;
            }


            yeelight.discover(function (device) {
                adapter.log.debug('Device:' + JSON.stringify(device));
                deviceDiscovered.push(device);
            });

            setTimeout(function () {
                yeelight.stopDiscovering();
                reply(deviceDiscovered);
            }, 30000);

            return true;
            break;
        default:
            adapter.log.debug('Unknown command: ' + obj.command);
            break;
    }
});

function main() {
    checkChanges(createDevice);
    adapter.subscribeStates('*');

};

function checkChanges(callback) {
    adapter.getForeignObjects(adapter.namespace + ".*", 'device', function (err, list) {
        if (err) {
            adapter.log.error(err);
        } else {
            objects = list;

            adapter.log.debug("found Devices:_" + JSON.stringify(objects));

            var count = Object.keys(objects).length;
            adapter.log.debug("count Devices:_" + count);
            //check every device
            for (var j = 0; j < count; j++) {
                var element = Object.keys(objects)[j];
                adapter.log.debug("Element:_" + element);

                var sid = objects[element].native.sid;
                var type = objects[element].native.type;
                getastate(element, ifinConfig);

                if (j === count - 1) {
                    setTimeout(function () {
                        createSocketsList();
                        updateConnect();
                        adapter.subscribeStates('*');
                        callback && callback();
                    }, 2000);


                }

            }
            if (count === 0) {
                setTimeout(function () {
                    createSocketsList();
                    updateConnect();
                    adapter.subscribeStates('*');
                    callback && callback();
                }, 2000);
            }
        }
    });

    function getastate(element, callback) {
        var info = adapter.getState(element + '.info.com', function (err, state) {
            adapter.log.debug("hier die ate cfg: " + state.val)
            if (callback && typeof (callback) === "function") callback(element, JSON.parse(state.val));
        });

    }

    function ifinConfig(element, oldConfig) {

        var sid = objects[element].native.sid;
        var type = objects[element].native.type;

        var isThere = false;
        for (var i = 0; i < sel_devices.length; i++) {
            if (sel_devices[i].name == sid && sel_devices[i].type == type) {
                isThere = true;
                adapter.log.debug("der sm: " + sel_devices[i].smart_name)
                if (sel_devices[i].ip !== oldConfig.ip) {
                    adapter.setState(element + ".info.IPAdress", sel_devices[i].ip, true)
                    adapter.setState(element + ".info.com", JSON.stringify(sel_devices[i]), true)
                }
                if (sel_devices[i].port !== oldConfig.port) {
                    adapter.setState(element + ".info.Port", sel_devices[i].port, true)
                    adapter.setState(element + ".info.com", JSON.stringify(sel_devices[i]), true)
                }
                if (sel_devices[i].smart_name !== oldConfig.smart_name) {
                    changeSmartName(element, sel_devices[i].smart_name)
                    adapter.setState(element + ".info.com", JSON.stringify(sel_devices[i]), true)
                }

            }

            if (i === sel_devices.length - 1 && isThere === false) {
                delDev(element.split(".")[2]);

                adapter.log.debug('object: ' + objects[element]._id + ' deleded');
            }
        }
    };

    function changeSmartName(element, newSm) {
        var Names = ["power", "ct", "active_bright", "hue", "sat"];
        adapter.log.debug("canged " + Names.length + " smartname to : " + newSm)

        for (var i = 0; i < Names.length; i++) {
            adapter.extendObject(element + ".control." + Names[i], {
                common: {
                    smartName: {
                        de: newSm
                    }
                }
            });
        }


    }

    function delDev(id) {
        adapter.deleteDevice(id, function (err, dat) {
            if (err) adapter.log.warn(err);
            //adapter.log.debug(dat);
        });
    }
}

function createDevice() {
    var devC = adapter.config.devices;

    if (typeof devC === "undefined") return

    for (var i = 0; i < devC.length; i++) {

        var sid = adapter.namespace + '.' + devC[i].type + '-' + devC[i].name;
        var device = devC[i].type + '-' + devC[i].name;

        adapter.log.debug("Create Device: " + sid);

        if (!objects[sid]) {

            adapter.createDevice(device, {
                name: devC[i].type,
                icon: '/icons/' + devC[i].type + '.png',
            }, {
                sid: devC[i].name,
                type: devC[i].type
            });
            adapter.createChannel(device, "info");
            adapter.createChannel(device, "control");
            adapter.createChannel(device, "control.scenen");
            _createscenen(sid);
            adapter.setObjectNotExists(sid + '.info.com', {
                common: {
                    name: 'Command',
                    role: 'state',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {}
            });

            adapter.setState(sid + '.info.com', JSON.stringify(devC[i]), true);

            adapter.setObjectNotExists(sid + '.info.connect', {
                common: {
                    name: 'Connect',
                    role: 'indicator.connected',
                    write: false,
                    read: true,
                    type: 'boolean'
                },
                type: 'state',
                native: {}
            });
            adapter.setObjectNotExists(sid + '.info.IPAdress', {
                common: {
                    name: 'IP',
                    role: 'state',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {}
            });
            adapter.setObjectNotExists(sid + '.info.Port', {
                common: {
                    name: 'Port',
                    role: 'state',
                    write: false,
                    read: true,
                    type: 'number'
                },
                type: 'state',
                native: {}
            });

            adapter.setState(sid + '.info.IPAdress', devC[i].ip, true);
            adapter.setState(sid + '.info.Port', devC[i].port, true);

            listen(devC[i].ip, devC[i].port, setStateDevice);
        };

        getPrps(sid + ".control", devC[i]);
    };

};

function _createscenen(sid) {
    for (var key in scenen) {
        adapter.setObjectNotExists(sid + '.control.scenen.' + key, {
            common: {
                name: key,
                role: 'button',
                write: true,
                read: false,
                type: 'boolean'
            },
            type: 'state',
            native: {}
        });
    }
};

function getPrps(sid, device) {

    var YeelState = new yeelight;
    YeelState.host = device.ip;
    YeelState.port = device.port;

    YeelState.sendCommand('get_prop', PARAMETERLIST, function (err, result) {
        adapter.log.debug('regest params from:' + sid + " _params:_" + JSON.stringify(result));
        //result = ["off", "1", "4000", "", "0", "2", "1", "", "", "0", "off", "off", "", "40", "180", "100", "65535", "4000"];
        if (err) {
            adapter.log.error(err);
        } else {
            adapter.setState(sid + '.info.connect', true, true);
            if (result) {
                if (!(result[0] === "")) {
                    switch (result[0]) {
                        case 'on':
                            addState(sid, 'power', true, device);
                            break;
                        case 'off':
                            addState(sid, 'power', false, device);
                            break;
                    }
                }
                if (!(result[1] === "")) {
                    addState(sid, 'active_bright', result[1], device);
                } else {
                    addState(sid, 'active_bright', result[6], device);
                }
                if (!(result[2] === "")) {
                    addState(sid, 'ct', result[2], device);
                }
                if (!(result[3] === "")) {
                    addState(sid, 'rgb', result[3], device);
                }
                if (!(result[4] === "")) {
                    switch (+result[4]) {
                        case 0:
                            addState(sid, 'moon_mode', false, device);
                            break;
                        case 1:
                            addState(sid, 'moon_mode', true, device);
                            break;
                    }
                }
                if (!(result[5] === "")) {
                    if (true) {
                        modeVal = result[5];
                        switch (+result[5]) {
                            case 1:
                                addState(sid, 'color_mode', true, device);
                                break;
                            case 2:
                                addState(sid, 'color_mode', false, device);
                                break;
                        }
                    }
                }
                if (!(result[7] === "")) {
                    addState(sid, 'hue', result[7], device);
                }
                if (!(result[8] === "")) {
                    addState(sid, 'sat', result[7], device);
                }
                if (!(result[10] === "")) {
                    switch (result[10]) {
                        case 'on':
                            addState(sid, 'main_power', true, device);
                            break;
                        case 'off':
                            addState(sid, 'main_power', false, device);
                            break;
                    }
                }
                if (!(result[11] === "")) {
                    switch (result[11]) {
                        case 'on':
                            addState(sid, 'bg_power', true, device);
                            break;
                        case 'off':
                            addState(sid, 'bg_power', false, device);
                            break;
                    }
                }
                if (!(result[13] === "")) {
                    addState(sid, 'bg_bright', result[13], device);
                }
                if (!(result[14] === "")) {
                    addState(sid, 'bg_hue', result[14], device);
                }
                if (!(result[15] === "")) {
                    addState(sid, 'bg_sat', result[15], device);
                }
                if (!(result[16] === "")) {
                    addState(sid, 'bg_rgb', result[16], device);
                }
                if (!(result[17] === "")) {
                    addState(sid, 'bg_ct', result[17], device);
                }
            } else {
                adapter.log.warn('No response from the device at: ' + YeelState.host + ':' + YeelState.port);
            }
        }
    })


}


function _sendscene(id, host, port, parameter, val) {
    var device = new yeelight;
    device.host = host;
    device.port = port;
    adapter.log.debug('scene:_' + parameter + " " + JSON.stringify(scenen[parameter]));
    device.sendCommand("set_scene", scenen[parameter], function (err, result) {
        if (err) {
            adapter.log.error(err)
        } else {
            if (result) {
                adapter.log.debug("Answer from set_power: " + JSON.stringify(result));
                if (result[0] == 'ok') {
                    //adapter.setState(id + '.' + parameter, val, true);
                }
            }
        }
    });

}

function uploadState(id, host, port, parameter, val) {
    var device = new yeelight;
    device.host = host;
    device.port = port;
    adapter.log.debug("Upload State " + parameter + " host: " + host + " Port: " + port + " Value: " + val);
    switch (parameter) {

        case 'power':
        case 'bg_power':
        case 'main_power':
            var powerState;
            switch (val) {
                case true:
                    powerState = 'on';
                    break;
                case false:
                    powerState = 'off';
                    break;
            }
            var powName = "";
            var bg = false;

            if (parameter === "power") powName = "set_power";

            if (parameter === "bg_power") {
                powName = "bg_set_power";
                bg = true;
            }

            // Maybe wrong ... testing
            if (parameter === "main_power") powName = "main_set_power";

            device.sendCommand(powName, [powerState, 'smooth', 1000], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        adapter.log.debug("Answer from set_power: " + JSON.stringify(result));
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.' + parameter, val, true);

                            // when main Light set color value
                            if (!bg) {
                                adapter.getState(id + '.color_mode', function (err, state) {
                                    if (err) {
                                        adapter.log.error(err)
                                    } else {
                                        if (state) {
                                            adapter.setState(id + '.' + '.color_mode', false, true);
                                        }
                                    }
                                });
                            }
                            if (val && !bg) {
                                getProp(device, "bright", function (result) {
                                    adapter.log.debug("Read bright because poweron: " + result[0]);
                                    adapter.setState(id + '.active_bright', result[0], true);
                                });
                            }
                            if (val && bg) {
                                getProp(device, "bg_bright", function (result) {
                                    adapter.log.debug("Read bright because poweron: " + result[0]);
                                    adapter.setState(id + '.bg_bright', result[0], true);
                                });
                            }
                        }
                    } else {
                        getProp(device, parameter, function (result) {
                            adapter.log.debug("Wrong respons at power on, ckeck again --> " + powerState + "  <<--soll ist-->> " + result[0]);

                            if (powerState == result[0]) {
                                adapter.setState(id + '.' + parameter, val, true);
                                if (!bg) {
                                    adapter.getState(id + '.color_mode', function (err, state) {
                                        if (err) {
                                            adapter.log.error(err)
                                        } else {
                                            if (state) {
                                                adapter.setState(id + '.' + '.color_mode', false, true);
                                            }
                                        }
                                    });
                                }
                                if (val && !bg) {
                                    getProp(device, "bright", function (result) {
                                        adapter.log.debug("Read bright because poweron: " + result[0]);
                                        adapter.setState(id + '.active_bright', result[0], true);
                                    });
                                }
                                if (val && bg) {
                                    getProp(device, "bg_bright", function (result) {
                                        adapter.log.debug("Read bright because poweron: " + result[0]);
                                        adapter.setState(id + '.bg_bright', result[0], true);
                                    });
                                }
                            } else {
                                adapter.log.debug('Error verifying power_on command')
                            }
                        });


                    }
                }
            })
            break;

        case 'active_bright':
        case 'bg_bright':
            // TODO 0 for Light off and power on brfore change!
            var set_param;
            var powName = "";
            if (parameter === 'active_bright') {
                set_param = 'set_bright';
                powName = "set_power";
            } else if (parameter === 'bg_bright') {
                set_param = 'bg_set_bright';
                powName = "bg_set_power";
            }
            device.sendCommand(powName, ['on', 'smooth', 1000], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.'+ powName, true, true);
                        }
                    }
                }
            });
            device.sendCommand(set_param, [val, 'smooth', 1000], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        adapter.log.debug("Answer from set_bright: " + JSON.stringify(result));
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.' + parameter, val, true);
                            adapter.setState(id + '.power', true, true);
                        }
                    } else {
                        getProp(device, parameter, function (result) {
                            adapter.log.debug("Wrong respons set_bright, ckeck again --> " + val + "  <<--soll ist-->> " + result[0]);
                            if (val == result[0]) {
                                adapter.setState(id + '.' + parameter, result[0], true);
                            } else {
                                adapter.log.debug('Error verifying active_bright command');
                            }
                        });
                    }
                }
            });
            break;

        case 'ct':
        case 'bg_ct':
            var set_param
            var powName = "";

            if (parameter === 'ct') {
                set_param = 'set_ct_abx';
                powName = "set_power";
            } else if (parameter === 'bg_ct') {
                set_param = 'bg_set_ct_abx';
                powName = "bg_set_power";
            }
            device.sendCommand(powName, ['on', 'smooth', 1000, 1], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    adapter.log.debug("Answer from rgb _power on an color mode before set: " + JSON.stringify(result));
                    if (result) {
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.color_mode', false, true);
                        }
                    }
                }
            });
            device.sendCommand(set_param, [val, 'smooth', 1000], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    if (result) {
                        adapter.log.debug("Answer from set_ct: " + JSON.stringify(result));
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.' + parameter, val, true);

                        }
                    } else {
                        getProp(device, parameter, function (result) {
                            adapter.log.debug("Wrong respons set_ct, ckeck again --> " + val + "  <<--soll ist-->> " + result[0]);
                            if (val == result[0]) {
                                adapter.setState(id + '.' + parameter, val, true);
                            } else {
                                adapter.log.warn('Error verifying set_ct command');
                            }
                        });
                    }
                }
            });
            break;

        case 'moon_mode':
            switch (val) {
                case true:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 5], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            adapter.log.debug("Answer from moon_mode: " + JSON.stringify(result));
                            if (result) {
                                adapter.log.debug(JSON.stringify(result));
                                if (result[0] == 'ok') {
                                    adapter.setState(id + '.' + parameter, val, true);
                                    adapter.setState(id + '.power', true, true);

                                }

                            } else {
                                getProp(device, "active_mode", function (result) {
                                    val = val ? 1 : 0;
                                    adapter.log.debug("Wrong respons for moon_mode , ckeck again --> " + val + "  <<--soll ist-->> " + result[0]);
                                    if (val == result[0]) {
                                        adapter.setState(id + '.' + parameter, true, true);
                                        adapter.setState(id + '.power', true, true);
                                        getProp(device, "active_bright", function (result) {
                                            adapter.log.debug("Read bright because moon_mode: " + result[0]);
                                            adapter.setState(id + '.active_bright', result[0], true);
                                        });
                                    } else {
                                        adapter.log.warn('Error verifying set_moon_mode command');
                                    }
                                });
                            }
                        }
                    })
                    break;

                case false:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 1], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            adapter.log.debug("Answer from moon_mode: " + JSON.stringify(result));
                            if (result) {
                                if (result[0] == 'ok') {
                                    adapter.setState(id + '.' + parameter, val, true);
                                }
                            } else {
                                if (val == getProp(device, parameter)) {
                                    adapter.setState(id + '.' + parameter, val, true);
                                    adapter.setState(id + '.active_bright', getProp(device.host, parameter));
                                } else {
                                    adapter.log.warn('Error verifying the command')
                                }

                                getProp(device, "active_mode", function (result) {
                                    val = val ? 1 : 0;
                                    adapter.log.debug("Wrong respons for moon_mode , ckeck again --> " + val + "  <<--soll ist-->> " + result[0]);
                                    if (val == result[0]) {
                                        adapter.setState(id + '.' + parameter, false, true);
                                        getProp(device, "active_bright", function (result) {
                                            adapter.log.debug("Read bright because moon_mode_off: " + result[0]);
                                            adapter.setState(id + '.active_bright', result[0], true);
                                        });
                                    } else {
                                        adapter.log.warn('Error verifying set_moon_mode_off command');
                                    }
                                });
                            }
                        }
                    })
                    break;
            }

            break;

        case 'rgb':
        case 'bg_rgb':

            var powName = "";
            var bg = false;
            var set_param;

            if (parameter === "rgb") {
                powName = "set_power";
                set_param = 'set_rgb';
            }

            if (parameter === "bg_rgb") {
                powName = "bg_set_power";
                bg = true;
                set_param = 'bg_set_rgb';
            }

            var isOk = /^#[0-9A-F]{6}$/i.test(val);
            // ckeck if it is a Hex Format
            if (isOk) {
                var rgb = hex2dec(val);
                adapter.log.debug("rgb to hs: " + JSON.stringify(rgbToHsl(val)));
                device.sendCommand(powName, ['on', 'smooth', 1000, 2], function (err, result) {
                    if (err) {
                        adapter.log.error(err)
                    } else {
                        adapter.log.debug("Answer from rgb _power on an color mode before set: " + JSON.stringify(result));
                        if (result) {
                            if (result[0] == 'ok') {
                                adapter.setState(id + '.color_mode', true, true);
                                adapter.setState(id + '.power', true, true);
                            }
                        } else {

                            getProp(device, 'color_mode', function (result) {
                                adapter.log.debug("No response, request color mode again: " + result[0]);


                                switch (result[0]) {
                                    case 1:
                                        adapter.setState(id + '.color_mode', true, true);

                                        break;
                                    case 2:
                                        adapter.setState(id + '.color_mode', false, true);

                                        break;
                                    default:
                                        adapter.log.warn('Error verifying rgb command');
                                        break;
                                }
                            });


                        }
                    }
                });
                device.sendCommand(set_param, [+rgb, 'smooth', 1000], function (err, result) {
                    if (err) {
                        adapter.log.error(err)
                    } else {
                        if (result) {
                            //adapter.log.debug(JSON.stringify(result));
                            if (result[0] == 'ok') {
                                adapter.setState(id + '.' + parameter, val, true)
                            }
                        } else {
                            getProp(device, parameter, function (result) {
                                adapter.log.debug("Wrong respons for set_rgb , ckeck again --> " + rgb + "  <<--soll ist-->> " + result[0]);
                                if (rgb == result[0]) {
                                    adapter.setState(id + '.' + parameter, val, true);
                                } else {
                                    adapter.log.warn('Error verifying set_rgb command');
                                }
                            });

                        }
                    }
                })
            } else {
                adapter.log.warn('Please enter a Hex Format like: "#FF22AA"');
            }
            break;

        case 'hue':
        case 'bg_hue':
            // TODO catch NAN an 1-360;

            var powName = "";
            var bg = false;
            var set_param;
            var satName;

            if (parameter === "hue") {
                powName = "set_power";
                set_param = 'set_hsv';
                satName = 'sat';
            }

            if (parameter === "bg_hue") {
                powName = "bg_set_power";
                bg = true;
                set_param = 'bg_set_hsv';
                satName = 'bg_sat';
            }


            device.sendCommand(powName, ['on', 'smooth', 1000, 3], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    adapter.log.debug("Answer from rgb _power on an color mode 3 before set: " + JSON.stringify(result));
                    if (result) {
                        adapter.log.debug(JSON.stringify(result));
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.color_mode', true, true);
                        }
                    } else {
                        getProp(device, 'color_mode', function (result) {
                            adapter.log.debug("No response, request color mode again: " + result[0]);


                            switch (result[0]) {
                                case 1:
                                    adapter.setState(id + '.color_mode', true, true);

                                    break;
                                case 2:
                                    adapter.setState(id + '.color_mode', false, true);

                                    break;
                                default:
                                    adapter.log.warn('Error verifying rgb command');
                                    break;
                            }
                        });
                    }
                }
            });

            adapter.getState(id + '.' + satName, function (err, state) {
                var saturation = state.val;

                adapter.log.debug("Answer from rgb _power on an color mode 3 beforesat_val: " + saturation);

                device.sendCommand(set_param, [val, saturation, 'smooth', 1000], function (err, result) {
                    if (err) {
                        adapter.log.error(err)
                    } else {
                        if (result) {
                            //adapter.log.debug(JSON.stringify(result));
                            if (result[0] == 'ok') {
                                adapter.setState(id + '.' + parameter, val, true)
                            }
                        } else {
                            getProp(device, parameter, function (result) {
                                adapter.log.debug("Wrong respons for set_hue , ckeck again --> " + val + "  <<--soll ist-->> " + result[0]);
                                if (val == result[0]) {
                                    adapter.setState(id + '.' + parameter, result[0], true);
                                } else {
                                    adapter.log.warn('Error verifying set_hue command');
                                }
                            });
                        }
                    }
                });
            });
            break;


        case 'sat':
        case 'bg_sat':
            // TODO catch NAN an 1-100;

            var powName = "";
            var bg = false;
            var set_param;
            var hueName;

            if (parameter === "sat") {
                powName = "set_power";
                set_param = 'set_hsv';
                hueName = 'hue';
            }

            if (parameter === "bg_hue") {
                powName = "bg_set_power";
                bg = true;
                set_param = 'bg_set_hsv';
                hueName = 'bg_hue';
            }

            device.sendCommand(powName, ['on', 'smooth', 1000, 3], function (err, result) {
                if (err) {
                    adapter.log.error(err)
                } else {
                    adapter.log.debug("Answer from rgb _power on an color mode 3 before set: " + JSON.stringify(result));
                    if (result) {
                        adapter.log.debug(JSON.stringify(result));
                        if (result[0] == 'ok') {
                            adapter.setState(id + '.color_mode', true, true);
                        }
                    } else {
                        getProp(device, 'color_mode', function (result) {
                            adapter.log.debug("No response, request color mode again: " + result[0]);


                            switch (result[0]) {
                                case 1:
                                    adapter.setState(id + '.color_mode', true, true);

                                    break;
                                case 2:
                                    adapter.setState(id + '.color_mode', false, true);

                                    break;
                                default:
                                    adapter.log.warn('Error verifying sat command');
                                    break;
                            }
                        });
                    }
                }
            });

            adapter.getState(id + '.' + hueName, function (err, state) {
                var huevalue = state.val;
                adapter.log.debug("hue" + huevalue + " sat " + val);
                device.sendCommand(set_param, [parseInt(huevalue), parseInt(val), 'smooth', 1000], function (err, result) {
                    if (err) {
                        adapter.log.error(err)
                    } else {
                        if (result) {
                            //adapter.log.debug(JSON.stringify(result));
                            if (result[0] == 'ok') {
                                adapter.setState(id + '.' + parameter, val, true)
                            }
                        } else {
                            getProp(device, parameter, function (result) {
                                adapter.log.debug("Wrong respons for set_hue , ckeck again --> " + val + "  <<--soll ist-->> " + result[0]);
                                if (val == result[0]) {
                                    adapter.setState(id + '.' + parameter, result[0], true);
                                } else {
                                    adapter.log.warn('Error verifying set_sat command');
                                }
                            });
                        }
                    }
                });
            });
            break;


        case 'color_mode':
            switch (val) {
                case true:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 2], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            if (result) {
                                //adapter.log.debug(JSON.stringify(result));
                                if (result[0] == 'ok') {
                                    adapter.setState(id + '.' + parameter, val, true)
                                }
                            } else {
                                getProp(device, 'color_mode', function (result) {
                                    adapter.log.debug("No response, request color mode again: " + result[0]);


                                    switch (result[0]) {
                                        case 1:
                                            adapter.setState(id + '.color_mode', true, true);

                                            break;
                                        case 2:
                                            adapter.setState(id + '.color_mode', false, true);

                                            break;
                                        default:
                                            adapter.log.warn('Error verifying color_mode command');
                                            break;
                                    }
                                });
                            }
                        }
                    })
                    break;
                case false:
                    device.sendCommand('set_power', ['on', 'smooth', 1000, 1], function (err, result) {
                        if (err) {
                            adapter.log.error(err)
                        } else {
                            if (result) {
                                adapter.log.debug(JSON.stringify(result));
                                if (result[0] == 'ok') {
                                    adapter.setState(id + '.' + parameter, val, true);
                                }
                            } else {
                                getProp(device, 'color_mode', function (result) {
                                    adapter.log.debug("No response, request color mode again: " + result[0]);


                                    switch (result[0]) {
                                        case 1:
                                            adapter.setState(id + '.color_mode', true, true);

                                            break;
                                        case 2:
                                            adapter.setState(id + '.color_mode', false, true);

                                            break;
                                        default:
                                            adapter.log.warn('Error verifying color_mode command');
                                            break;
                                    }
                                });
                            }
                        }
                    });
                    break;
            }
            break;
        default:
            adapter.log.warn('State not found');
    }


};

function getProp(device, parameter, callback) {
    //var device = new yeelight;
    adapter.log.debug("get_prob:_" + parameter + "__" + device.host + '__' + device.port);
    // device.host = host;
    // device.port = 55443;
    var param;


    switch (parameter) {

        case 'moon_mode':
            param = 'active_mode';
            break;
        default:
            param = parameter;
            break;
    }

    device.sendCommand('get_prop', [param], function (err, result) {
        if (err) {
            adapter.log.error(err)

        } else {
            if (result) {
                if (callback && typeof (callback) === "function") callback(result);
                return result[0];
            }
        }
    })
}

function dec2hex(dec) {
    return '#' + (+dec).toString(16);
}

function hex2dec(hex) {
    return parseInt(hex.substring(1), 16);
}

function listen(host, port, callback) {
    adapter.log.debug("listen to: " + host + ':' + port);
    var socket = net.connect(port, host);
    socket.on('data', function (data) {
        if (callback) {
            try {
                data = JSON.parse(data);
            } catch (e) {
                callback(e);
                return;
            }
            if (data['error']) {
                callback(new Error(data['error']['message']));
            } else {
                callback(socket.remoteAddress, data['params']);
            }
        }
        // socket.destroy();
    });
    socket.on('error', function (err) {
        socket.destroy();
        adapter.log.error(err);
    });


}

function setStateDevice(ip, state) {
    adapter.log.debug(ip);
    var id = sockets[ip] + ".control";
    adapter.log.debug("This id:_" + id);
    adapter.log.debug(JSON.stringify(state));
    adapter.log.debug(JSON.stringify(sockets));
    for (var key in state) {
        adapter.log.debug(key);
        switch (key) {
            case 'power':
            case 'main_power':
            case 'bg_power':
                switch (state[key]) {
                    case 'on':
                        adapter.setState(id + '.' + key, true, true);
                        break;
                    case 'off':
                        adapter.setState(id + '.' + key, false, true);
                        break;
                }
                break;
            case 'bright':
            case 'active_bright':
            case 'ct':
            case 'bg_bright':
            case 'bg_ct':
            case 'bg_hue':
            case 'bg_sat':
            case 'sat':
            case 'hue':
                if (key == 'bright') {
                    adapter.setState(id + '.active_bright', +state[key], true);
                }
                adapter.setState(id + '.' + key, state[key], true);
                break;
            case 'rgb':
            case 'bg_rgb':
                var value = dec2hex(state[key]);
                adapter.setState(id + '.' + key, value, true);
                break;
            case 'active_mode':
                switch (+state[key]) {
                    case 0:
                        adapter.setState(id + '.moon_mode', false, true);
                        break;
                    case 1:
                        adapter.setState(id + '.moon_mode', true, true);
                        break;
                }
                break;
            case 'color_mode':
                modeVal = state[key];
                switch (+state[key]) {
                    case 1:
                        adapter.setState(id + '.color_mode', true, true);
                        break;
                    case 2:
                        adapter.setState(id + '.color_mode', false, true);
                        break;
                }
                break;
        }
    }

}

function updateConnect() {
    adapter.getForeignObjects(adapter.namespace + ".*", 'device', function (err, list) {
        if (err) {
            adapter.log.error(err);
        } else {
            objects = list;
            for (var key in objects) {
                var id = key;
                adapter.log.debug("Update connection for:_" + id);
                adapter.getState(id + '.info.IPAdress', function (err, Ip) {
                    if (err) {
                        adapter.log.error(err);
                    } else {
                        var device = new yeelight;
                        device.host = Ip.val;
                        device.port = 55443;
                        device.sendCommand('get_prop', ['power'], function (err, result) {
                            if (err) {
                                adapter.log.error(err);
                            } else {
                                if (result) {
                                    adapter.setState(id + '.info.connect', true, true);
                                } else {
                                    adapter.setState(id + '.info.connect', false, true);
                                }
                            }
                        })
                        listen(Ip.val, 55443, setStateDevice);
                    }
                })
            }
        }

    });

}

function addState(id, state, val, device) {

    var ct_min = 1700;
    var ct_max = 6500;
    var smartname = "";

    if (typeof device.type !== 'undefined') {
        if (device.type === 'ceiling1') {
            ct_min = 2600
        };
    }
    if (typeof device.smart_name !== 'undefined') {
        if (device.smart_name !== '') {
            smartname = device.smart_name
        };
        //adapter.log.warn(device.smart_name);
    }

    switch (state) {
        case 'power':
        case 'bg_power':
        case 'main_power':
            adapter.setObjectNotExists(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'switch',
                    write: true,
                    read: true,
                    type: 'boolean',
                    smartName: {
                        de: smartname,
                        smartType: "LIGHT"
                    }
                },
                native: {}
            });
            adapter.setState(id + '.' + state, val, true);
            break;

        case 'moon_mode':
        case 'color_mode':
            adapter.setObjectNotExists(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'switch',
                    write: true,
                    read: true,
                    type: 'boolean'
                },
                native: {}
            });
            adapter.setState(id + '.' + state, val, true);
            break;
        case 'ct':
        case 'bg_ct':
            adapter.setObjectNotExists(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'level.color.temperature',
                    write: true,
                    read: true,
                    type: 'number',
                    min: ct_min,
                    max: ct_max,
                    unit: 'K',
                    smartName: {
                        de: smartname,
                        smartType: "LIGHT"
                    }
                },
                native: {}
            });
            adapter.setState(id + '.' + state, val, true);
            break;
        case 'active_bright':
        case 'bg_bright':
            adapter.setObjectNotExists(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'level.dimmer',
                    write: true,
                    read: true,
                    type: 'number',
                    min: 0,
                    max: 100,
                    unit: "%",
                    smartName: {
                        de: smartname,
                        smartType: "LIGHT",
                        byON: "-"
                    }
                },
                native: {}
            });
            adapter.setState(id + '.' + state, val, true);
            break;
        case 'hue':
        case 'bg_hue':
            adapter.setObjectNotExists(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'level.color.hue',
                    write: true,
                    read: true,
                    type: 'number',
                    min: 0,
                    max: 360,
                    smartName: {
                        de: smartname,
                        smartType: "LIGHT"
                    }
                },
                native: {}
            });
            adapter.setState(id + '.' + state, val, true);
            break;
        case 'sat':
        case 'bg_sat':
            adapter.setObjectNotExists(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'level.color.saturation',
                    write: true,
                    read: true,
                    type: 'number',
                    min: 0,
                    max: 100,
                    smartName: {
                        de: smartname,
                        smartType: "LIGHT"
                    }
                },
                native: {}
            });
            adapter.setState(id + '.' + state, val, true);
            break;
        case 'rgb':
        case 'bg_rgb':
            adapter.setObjectNotExists(id + '.' + state, {
                type: 'state',
                common: {
                    name: state,
                    role: 'level.' + state,
                    write: true,
                    read: true,
                    type: 'string'
                },
                native: {}
            });
            val = dec2hex(val);
            adapter.setState(id + '.' + state, val, true);
            break;
    }

}

function createSocketsList() {
    adapter.getStates(adapter.namespace + '.*.info.IPAdress', function (err, list) {
        if (err) {
            adapter.log.error(err);
        } else {
            var temp = {};
            temp = list;
            for (var key in temp) {
                if (~key.indexOf('IPAdress')) {
                    var id = key;
                    var ip = temp[key].val;
                    var sid = id.split('.');
                    adapter.log.debug("sid by socket:_" + JSON.stringify(sid));
                    id = sid[0] + '.' + sid[1] + '.' + sid[2];
                    sockets[ip] = id;
                    //adapter.log.warn(JSON.stringify(sockets));
                }
            }
        }
    });

    /*  for (var key in objects) {
  
  
        if (key) {
  
              adapter.getState(key + '.info.IPAdress', function (err, Ip) {
                  if (err) {
                      adapter.log.error(err);
                  } else {
                      sockets[Ip.val] = key;
                  }
              })
          }
  
      }
    */
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   {number}  h       The hue
 * @param   {number}  s       The saturation
 * @param   {number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
function hslToRgb(h, s, l) {
    var r, g, b;

    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        var hue2rgb = function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}


/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   {number}  r       The red color value
 * @param   {number}  g       The green color value
 * @param   {number}  b       The blue color value
 * @return  {Array}           The HSL representation
 */
function rgbToHsl(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    var r = parseInt(result[1], 16);
    var g = parseInt(result[2], 16);
    var b = parseInt(result[3], 16);

    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if (max == min) {
        h = s = 0; // achromatic
    } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    return [Math.round(h * 360), Math.round(s * 100)];
}