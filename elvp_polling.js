var serialport = require('serialport');
var rpio = require('rpio');
var db = require('./database');

var mains_pin = 33;
var inverter_pin = 35;

var delay = 10000;
var next = Date.now();

setInterval(poll_database, 10000);
poll_database();

function poll_database() {
  db.getMonitorData(1, function (err, data) {
    if (err) {
      return console.log(err.message);
    }
    exports.history = data;
  });
}

rpio.open(mains_pin, rpio.INPUT, rpio.PULL_DOWN);
rpio.open(inverter_pin, rpio.INPUT, rpio.PULL_DOWN);

var elvp_alarms = {
  'Low Battery Voltage': { state: false, type: 'elvp' },
};

var elvp_data = {
  mains: false,
  inverter: false,
  serial: {
    PID: '',
    V: '',
    VS: '',
    I: '',
    P: '',
    CE: '',
    SOC: '',
    TTG: '',
    Alarm: '',
    Relay: '',
    AR: '',
    BMV: '',
    FW: '',
    H1: '',
    H2: '',
    H3: '',
    H4: '',
    H5: '',
    H6: '',
    H7: '',
    H8: '',
    H9: '',
    H10: '',
    H11: '',
    H12: '',
    H15: '',
    H16: '',
    H17: '',
    H18: ''
  }
}

exports.data = elvp_data;
exports.alarms = elvp_alarms;

var battMon = new serialport('/dev/ttyS0', {
  baudRate: 19200,
  autoOpen: false,
  // look for return and newline at the end of each data packet:
  parser: serialport.parsers.readline('\r\n')
});

battMon.on('open', showPortOpen);
battMon.on('data', sendSerialData);
battMon.on('close', showPortClose);
battMon.on('error', showError);

battMon.open();

function showPortOpen() {
  console.log('port open. Data rate: ' + battMon.options.baudRate);
}

function sendSerialData(data) {
  var v = data.split('\t');

  if (v[0] in elvp_data.serial) {
    elvp_data.serial[v[0]] = v[1];
  }

  if (v[0] == 'H18' && next <= Date.now() && elvp_data.PID != '' && !isNaN((elvp_data.serial.V / 1000)) && !isNaN((elvp_data.serial.VS / 1000)) && !isNaN((elvp_data.serial.I / 1000))) {
    updateAlarms();
    next = Date.now() + delay;
    var graph_data = {
      voltage_emergency: +((elvp_data.serial.V / 1000).toFixed(2)),
      voltage_standby: +((elvp_data.serial.VS / 1000).toFixed(2)),
      current_battery: +((elvp_data.serial.I / 1000).toFixed(2)),
      voltage_mains: elvp_data.mains,
      voltage_inverter: elvp_data.inverter
    }
    db.addMonitorData(1, graph_data, function (err, success) {
      if (err)
        return console.log(err.message);
    });
  }
}

function showPortClose() {
  console.log('port closed.');
  setTimeout(battMon.open, 1000);
}

function showError(error) {
  console.log('Serial port error: ' + error);
  setTimeout(battMon.open, 1000);
}

serialport.list(function (err, ports) {
  ports.forEach(function (port) {
    console.log(port.comName);
  });
});

function pollPins(pin) {
  switch (pin) {
    case mains_pin:
      elvp_data.mains = !!rpio.read(pin);
      break;
    case inverter_pin:
      elvp_data.inverter = !!rpio.read(pin);
      break;
  }
}

function updateAlarms() {
  elvp_alarms['Low Battery Voltage'].state = elvp_data.serial.Relay == 'ON';
}

elvp_data.mains = !!rpio.read(mains_pin);
elvp_data.inverter = !!rpio.read(inverter_pin);

rpio.poll(mains_pin, pollPins);
rpio.poll(inverter_pin, pollPins);