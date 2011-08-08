var http = require('http');
var io = require('./socket.io');
var oscar = require('./oscar');

var botLogins = require('./bot-logins').logins;

function log(msg) {
	console.log('[' + Date() + '] ' + msg);
}

var storeIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 120, 121, 122, 123, 124, 125, 126, 127, 129, 130, 131, 132, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 146, 147, 148, 149, 151, 152, 153, 154, 155, 156, 159, 161, 162, 163, 164, 166, 167, 168, 169, 171, 172, 173, 174, 177, 180, 182, 183, 184, 185, 186, 189, 190, 191, 192, 193, 198, 199, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 213, 214, 215, 216, 217, 218, 219, 221, 225, 226, 227, 228, 229, 230, 231, 232, 233, 235, 236, 237, 238, 239, 240, 242, 244, 245, 247, 248, 250, 251, 252, 253, 254, 255, 257, 258, 259, 263, 264, 266, 267, 269, 270, 271, 272, 273, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 287, 288, 289, 290, 291, 292, 293, 294, 297, 298, 300, 301, 302, 303, 304, 305, 307, 308, 309, 312, 313, 315, 316, 317, 318, 320, 321, 322, 324, 325, 327, 332, 333, 334, 335, 338, 339, 341, 342, 344, 345, 346, 348, 350, 351, 352, 353, 354, 355, 360, 362, 363, 364, 365, 366, 367, 369, 384, 385, 386, 388, 389, 390, 391, 392, 393, 395, 397, 403, 406, 411, 412, 413, 417, 418, 420, 421, 423, 424, 429, 430];
//var numStores = 430;

var contactsPerBot = 1000; // maximum buddy list size
var storesPerBot = contactsPerBot / 100;

var statuses = {};

var server = http.createServer();
server.listen(6730);
var io = io.listen(server);
io.on('connection', function (client) {
	client.send(statuses);
});

function contactStatusChanged(sn, status, suppressLog) {
	if (status == statuses[sn]) return;
	if (status) statuses[sn] = status;
	else delete statuses[sn];
	
	var delta = {};
	delta[sn] = status;
	io.broadcast(delta);
	
	if (!suppressLog) {
		//log('Contact ' + sn + ' changed to ' + status + '.');
	}
}

function onContactOffline(user) {
	contactStatusChanged(user.name, null);
}

function onContactOnline(user) {
	contactStatusChanged(user.name, "available");
}

function onContactUpdate(user) {
	var status = user.status;//'other';
	if (user.idleMins)
		status = 'idle';
	else if (user.status === oscar.USER_STATUSES.OFFLINE)
		status = null;
	else if (user.status === oscar.USER_STATUSES.ONLINE)
		status = 'available';
	else if (user.status === oscar.USER_STATUSES.AWAY)
		status = 'away';
	contactStatusChanged(user.name, status);
}

var bots = [];
var numBots = 0;
var numBotsNeeded = Math.ceil(storeIds.length / storesPerBot);
for (var i in botLogins) (function (login, i) {
	numBots++;
	setTimeout(function () {
		startBot(login[0], login[1], i);
		// stagger logins to stay under rate limits
	}, i * 120 * 1000);
})(botLogins[i], i);

log('We have ' + numBots + ' bots. Should have ' + numBotsNeeded + '.');

function logBotsStatus() {
	var connected = bots.filter(function (bot) {
		return bot._isConnected();
	}).length;
	log('Bots connected: ' + connected + '/' + numBots + '.');
	contactStatusChanged('_coverage', [connected, numBotsNeeded], true);
}
	
function startBot(sn, pass, i) {
	var bot = new oscar.OscarConnection({
		connection: {
			username: sn,
			password: pass,
			debug: function (msg) {
				//log(msg);
			}
		}
	});
	bots[i] = bot;
	
	function botLog(msg) {
		log('Bot ' + i + msg);
	}
	
	var connected = false;
	var connecting = false;
	var waitingReconnect = false;
	
	function scheduleReconnect(mins) {
		if (waitingReconnect) return;
		waitingReconnect = true;
		botLog(' will try reconnect in ' + mins + ' min.');
		setTimeout(function () {
			botLog(' reconnecting.');
			waitingReconnect = false;
			connect();
		}, mins * 60 * 1000);
	}
	
	bot.on('contactoffline', onContactOffline);
	bot.on('contactonline', onContactOnline);
	bot.on('contactupdate', onContactUpdate);
	bot.on('ratelimitchange', function (rates) {
		botLog(' rate alerted: ', rates.levels.current);
	});
	bot.on('error', function (error) {
		botLog(' errored. ' + error);
		if (error.toString().indexOf('ETIMEDOUT') != -1) {
			scheduleReconnect(1);
		}
	});
	bot.on('close', function (error) {
		if (error) {
			botLog(': connection closed with error.');
			connected = false;
			logBotsStatus();
			scheduleReconnect(10);
		} else {
			botLog(': connection closed without error.');
		}
	});
	bot.on('end', function () {
		botLog(': connection ended.');
		connected = false;
	});
	bot.on('im', function(text, sender, flags, when) {
		botLog(' received ' + (when ? 'offline ' : '')
			+ 'IM from ' + sender.name + (when ? ' (on ' + when + ')' : '')
			+ ': ' + text);
		if (when) return;
		//aim.sendIM(sender.name, 'I got your IM!');
	});
	function connect() {
		if (connected || connecting) return;
		botLog(' connecting (' + sn + ')');
		connecting = true;
		bot.connect(function (error) {
			connecting = false;
			if (error) {
				connected = false;
				botLog(' unable to connect. ' + error);
				if (error.toString().indexOf('Rate limit exceeded') != -1) {
					scheduleReconnect(10);
				}
				return;
			} else {
				connected = true;
				botLog(' connected.');
				logBotsStatus();
				if (i < numBotsNeeded) {
					syncBotBuddyList(bot, +i);
				}
			}
		});
	}
	bot._connect = connect;
	bot._connect();
	bot._isConnected = function () {
		return connected;
	};
}

Function.prototype.bind = function (context) {
	var fn = this;
	return function () {
		return fn.apply(context, arguments);
	};
};

function FunctionQueue(time) {
	var queue = [];
	time = +time || 1000;
	var queueInProgress;
	function go() {
		if (!queueInProgress) {
			queueInProgress = setTimeout(pop, time);
		}
	}
	function pop() {
		queueInProgress = null;
		var fn = queue.shift();
		if (fn) {
			fn();
			go();
		}
	}
	this.add = function (fn) {
		if (fn) queue.push(fn);
		go();
	};
}

// time between contact adds and removals
var contactWait = 10000;
var contactRetry = 20000;

var contactsPerGroup = 500;

// put the right contacts on the buddy list
function syncBotBuddyList(bot, botNum) {
	var queue = new FunctionQueue(contactWait);
	
	// figure out what this buddy list should be
	var buddyListGoal = [{}, {}]; // 2 groups of 500
	var groupsByContactGoal = {};
	var n = 0;
	for (var i = botNum * storesPerBot; i < (botNum + 1) * storesPerBot; i++) {
		if (!(i in storeIds)) continue;
		var storeId = ('000' + storeIds[i]).substr(-3);
		for (var j = 0; j < 100; j++) {
			var groupName = Math.floor(n++ / contactsPerGroup).toString();
			var sn = 'ars' + storeId + '.' + ('0' + j).substr(-2) + '@mac.com';
			buddyListGoal[groupName][sn] = true;
			groupsByContactGoal[sn] = groupName;
		}
	}
	
	var groupsToDelete = [];
	var groupsToAdd = [];
	var contactsToDelete = [];
	var contactsToAdd = [];

	// find contacts and groups to delete
	var groupsByContactCurrent = {};
	var buddyListCurrent = {};
	var groups = bot.contacts.list;
	for (var i in groups) {
		var group = groups[i];
		if (!(group.name in buddyListGoal)) {
			groupsToDelete.push(group.name);
		}
		buddyListCurrent[group.name] = {};
		for (var j in group.contacts) {
			var contact = group.contacts[j];
			buddyListCurrent[group.name][contact.name] = true;
			groupsByContactCurrent[contact.name] = group.name;
			var groupGoal = groupsByContactGoal[contact.name];
			if (groupGoal != group.name) {
				contactsToDelete.push(contact.name);
			}
		}
	}
	
	// find groups to add
	for (var group in buddyListGoal) {
		if (!(group in buddyListCurrent)) {
			groupsToAdd.push(group);
		}
	}
	
	// find contacts to add
	for (var sn in groupsByContactGoal) {
		if (groupsByContactCurrent[sn] != groupsByContactGoal[sn]) {
			contactsToAdd.push(sn);
		}
	}
	
	log("Bot " + botNum + " needs to " +
		"delete " + groupsToDelete.length + " groups, " +
		"add " + groupsToAdd.length + " groups, " +
		"delete " + contactsToDelete.length + " contacts, " +
		"and add " + contactsToAdd.length + " contacts.");
	
	function processList(verb, contacts, act, done) {
	queue.add(function next(sn) {
		if (!sn) sn = contacts.shift();
		if (!sn) {
			if (done) done();
			return;
		}
		log('Bot ' + botNum + ': ' + verb + ' "' + sn + '"');
		var returned, retried;
		function doneMaybe(error) {
			if (error) {
				log('Bot ' + botNum + ': Error ' + verb +
					' "' + sn + '": ' + error);
				// retry later
			} else {
				returned = true;
				if (!retried) {
					queue.add(next);
				}
			}
		}
		try {
			act(sn, doneMaybe);
		} catch(err) {
			log('Bot ' + botNum + ': Error ' + verb +
					' "' + sn + '": ' + err);
			log('Bot ' + botNum + ' disconnecting. Reconnect in 30s.');
			returned = retried = true;
			bot.end();
			setTimeout(bot._connect, 30000);
		}
		setTimeout(function () {
			if (!returned) {
				log('Bot ' + botNum + ' retrying ' +
					verb + ' "' + sn + '"');
				retried = true;
				queue.add(function () { next(sn) });
			}
		}, contactRetry);
	});
	}
	
	processList("removing group", groupsToDelete, function (group, cb) {
		bot.delGroup(group, true, cb);
	});
	
	processList("adding group", groupsToAdd, bot.addGroup.bind(bot), function(){
		// wait for the groups to be ready before adding contacts to them.
		
		processList("removing", contactsToDelete, bot.delContact.bind(bot),
			function () {
			// remove contacts before adding contacts
			processList("adding", contactsToAdd, function (sn, cb) {
				bot.addContact(sn, groupsByContactGoal[sn], cb);
			});
		});
	});
}
