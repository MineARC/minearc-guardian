var nmap = require('libnmap');
var request = require('request');
var os = require('os');
var v6 = require('ip-address').Address6;
var exports = module.exports;

var db = require('./database');

// Define object for access from where they are needed
exports.hosts_data = [];

setInterval(poll_database, 20000);
poll_database();

function poll_database() {
  db.getRecentGuardians(function (err, data) {
    if (err) {
      return console.log(err.message);
    }
    exports.hosts_data = data;
  });
}

setInterval(poll_nmap, 30000);
poll_nmap();

function adapters() {
  var ret = []
    , adapter = ''
    , netmask = ''
    , adapters = os.networkInterfaces();

  for (var iface in adapters) {

    if (iface == 'eth0' || iface == 'wlan1') {

      for (var dev in adapters[iface]) {
        adapter = adapters[iface][dev];

        if (!adapter.internal && adapter.address && !adapter.address.includes('169.254.')) { //TODO remove internal interface?

          if (!adapter.netmask)
            return false;

          if (adapter.netmask) {

            netmask = adapter.netmask;

            /* Convert netmask to CIDR notation if IPv6 */
            if (/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*/.test(netmask)) {
              netmask = new v6(netmask).subnet.substring(1);
            }

            ret.push(adapter.address + '/' + netmask);
          }
        }
      }
    }
  }

  return ret;
}

function poll_nmap() {
  var opts = {
    // timeout: 1,
    range: adapters(),
    flags: [
      '--open'],
    ports: '80'
  };

  if (opts.range && opts.range != '') {
    // Scan all hosts to see which have port 8000 open
    nmap.scan(opts, function (err, report) {
      if (err) throw new Error(err);
      var hosts = [];
      for (var range in report) {
        // Seach through all the active hosts
        for (var host in report[range].host) {
          var ipv4_addr = '';
          // Each host can have multiple addresses so search them all
          for (var address in report[range].host[host].address) {
            // Grab only the ipv4 address
            if (report[range].host[host].address[address].item.addrtype == 'ipv4')
              ipv4_addr = report[range].host[host].address[address].item.addr
          }
          hosts.push({ ip: ipv4_addr });
        }
      }

      hosts.forEach(function (element) {
        // Form a request for the guardian overview api endpoint
        var request_options = {
          url: 'http://' + element.ip + '/api/overview',
          proxy: ''
        };

        request.get(request_options, function (err, res, body) {
          try {
            if (!err && res.statusCode == 200) {
              api_res = JSON.parse(body);
              // Check to see if the api response came from a guardian system
              if (api_res.guardian) {
                // Everything but the ip address comes from the api
                switch (api_res.hostname) {
                  case 'guardian-1640':
                    element.ip = '1640.minearcguardian.com';
                    break;
                  case 'guardian-1638':
                    element.ip = '1638.minearcguardian.com';
                    break;
                  case 'guardian-1002':
                    element.ip = 'aus-s4.minearcguardian.com';
                    break;
                  case 'guardian-1000':
                    element.ip = 'aus.minearcguardian.com';
                    break;
                  case 'guardian-1003':
                    element.ip = 'aus-elvp.minearcguardian.com';
                    break;
                }
                api_res['ip'] = element.ip;
                db.addGuardian(api_res.hostname, api_res, function (err, changes) {
                  if (err) {
                    console.log(err.message);
                  }
                });
              }
            }
          }
          catch (e) { }
        });
      });
    });
  }
};