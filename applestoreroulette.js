if(!Array.prototype.forEach)Array.prototype.forEach=function(c,d){if(this===void 0||this===null)throw new TypeError;var b=Object(this),e=b.length>>>0;if(typeof c!=="function")throw new TypeError;for(var a=0;a<e;a++)a in b&&c.call(d,b[a],a,b)};

// Yes, I like messing with native prototypes. It's fun.
Array.prototype.first = function (test) {
	for (var i = 0; i < this.length; i++) {
		if (test(this[i])) {
			return this[i];
		}
	}
};

// Screw IE6. Sorry 0.34% of my visitors.
Node.prototype.prependChild = function (child) {
	var firstChild = this.firstChild;
	if (firstChild) {
		this.insertBefore(child, firstChild);
	} else {
		this.appendChild(child);
	}
};

var accountsList;
var storesInfo = window.appleStoresInfo;
var firstUpdate = true;

var stores = {};
function getStore(storeId) {
	return stores[storeId] || (stores[storeId] = new Store(storeId));
}

function Store(storeId) {
	this.accounts = {};
	this.storeId = storeId;
	var info = this.info = storesInfo.first(function (storeInfo) {
		return storeInfo.id == 'R' + storeId;
	});
	this.title = info.name + " (" + info.city +
		(info.state ? ", " + info.state:"") + ", " + info.country + ")";
	
	this.el = document.createElement("div");
	this.el.className = "store";
	
	var infoEl = document.createElement("div");
	infoEl.className = "store-info";
	this.el.appendChild(infoEl);
	
	var headingEl = document.createElement("h3");
	headingEl.innerHTML = info.name;
	infoEl.appendChild(headingEl);
	
	var subHeadingEl = document.createElement("div");
	subHeadingEl.className = "subtitle";
	subHeadingEl.innerHTML = info.city + (info.state ? ", " + info.state:"") +
		", " + info.country;
	infoEl.appendChild(subHeadingEl);
	
	this.accountsEl = document.createElement("div");
	this.accountsEl.className = "accounts";
	this.el.appendChild(this.accountsEl);
	
	this.add();
}
Store.prototype = {
	numAccounts: 0,
	addAccount: function (account) {
		this.accounts[account.sn] = account;
		this.accountsEl.prependChild(account.el);
		if (this.numAccounts++ == 0) {
			this.add();
		}
		if (!firstUpdate) {
			var fullHeight = account.el.offsetHeight;
			account.el.style.height = "0px";
			Transition(account.el, {height: fullHeight + "px"}, 500);
		}
	},
	removeAccount: function (account) {
		delete this.accounts[account.sn];
		var self = this;
		account.el.style.height = account.el.scrollHeight + "px";
		setTimeout(function () {
			Transition(account.el, {height: "0px"}, 1000, function (n) {
				if (n < 1) return;
				self.accountsEl.removeChild(account.el);
			});
		}, 10);
		if (--this.numAccounts == 0) {
			this.remove();
		}
	},
	add: function () {
		accountsList.prependChild(this.el);
	},
	remove: function () {
		var el = this.el;
		this.el.style.height = "51px";
		setTimeout(function () {
			Transition(el, {height: "0px"}, 1000, function (n) {
				if (n < 1) return;
				accountsList.removeChild(this);
				this.style.height = "";
			});
		}, 10);
	}
};

var protocols = {
	'aim': 'aim:goim?screenname=',
	'ichat': 'ichat:compose?service=AIM&id='
};
var osx = navigator.userAgent.indexOf("Mac OS X") != -1;
var protocol = osx ? 'ichat' : 'aim';

var loadIcons = (location.search.indexOf("noicons") == -1);

function Account(sn) {
	this.sn = sn;
	var storeId = sn.substr(3,3);
	this.store = getStore(storeId);
	
	this.el = document.createElement("a");
	this.el.className = "account";
	this.el.title = "Chat with " + sn;
	this.updateLink();
	
	this.indicator = document.createElement("span");
	this.indicator.className = "indicator";
	this.el.appendChild(this.indicator);
	
	this.iconFrame = document.createElement("div");
	this.iconFrame.className = "buddyicon";
	this.el.appendChild(this.iconFrame);
	
	this.icon = document.createElement(loadIcons ? "img" : "span");
	this.icon.src =
	 "http://api.oscar.aol.com/expressions/get?f=native&type=buddyIcon&t=" + sn;
	this.icon.onerror = function () { this.parentNode.removeChild(this); };
	this.iconFrame.appendChild(this.icon);
	
	this.chatIcon = document.createElement("span");
	this.chatIcon.className = "chat-icon";
	this.el.appendChild(this.chatIcon);
	
	this.store.addAccount(this);
	
	/*
	var self = this;
	this.el.onclick = function () {
		self.remove();
		return false;
	}
	*/
}
Account.prototype = {
	update: function (status) {
		this.indicator.title = status;
		this.indicator.className = "indicator " + status;
	},
	remove: function () {
		this.store.removeAccount(this);
	},
	updateLink: function () {
		this.el.href = protocols[protocol] + this.sn;
	}
};

function coverageChanged(coverage) {
	document.getElementById("coverage_amount").innerText =
		(coverage * 100).toFixed();
}

var accounts = {};
function addSN(sn) {
	if (sn == "_coverage") return;
	return (accounts[sn] = new Account(sn));
}
function updateSN(sn, status) {
	if (sn.toString().length <= 1) {
		alert("weirdness!");
		debugger;
	}
	if (sn == "_coverage") {
		coverageChanged(status[0] / status[1]);
		return;
	}
	accounts[sn].update(status);
}
function removeSN(sn) {
	if (sn == "_coverage") return;
	accounts[sn].remove();
	delete accounts[sn];
}

var statuses = {};
var gotList = false;

var socket = io.connect('http://home.lehnerstudios.com:6730/', {
	maxReconnectionAttempts: 100
});
socket.connect();
socket.on('connect', function () {
	gotList = false;
	accountsList.style.opacity = 0;
	setTimeout(function () {
		Transition(accountsList, {opacity: 1}, 2000);
	}, 10);
});
socket.on('disconnect', function () {
	accountsList.style.opacity = 1;
	Transition(accountsList, {opacity: 0}, 2000);
	coverageChanged(0);
});
socket.on('message', function(statusChanges) {
	if (typeof statusChanges != "object") return;
	//console.log(statusChanges);
	if (!gotList) {
		gotList = true;
		// first status update; contains the entire online list
		// if this is a reconnect, we need to remove offline accounts.
		for (var sn in statuses) {
			if (!(sn in statusChanges)) {
				statusChanges[sn] = null;
			}
		}
	} else if (firstUpdate) {
		firstUpdate = false;
	}
	for (var sn in statusChanges) {
		var oldStatus = statuses[sn];
		var newStatus = statusChanges[sn];
		if (oldStatus == newStatus) continue;
		if (newStatus) {
			statuses[sn] = newStatus;
			if (!oldStatus) {
				addSN(sn);
			}
			updateSN(sn, newStatus);
		} else {
			delete statuses[sn];
			removeSN(sn);
		}
	}
});

setTimeout(function () {
	accountsList = document.getElementById("accounts");
	accountsList.className += " protocol-" + protocol;
}, 10);
