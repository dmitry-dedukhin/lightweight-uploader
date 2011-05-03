(function(wnd) {

var FE_INIT_NOTSTARTED = 0;
var FE_INIT_INPROGRESS = 1;
var FE_INIT_SUCCESS = 2;
var FE_INIT_FAIL = 3;

var gebi = function(id) {
	return document.getElementById(id);
};

var attr = function(elm, props) {
	if(props && elm) {
		for(var i in props) {
			elm.setAttribute(i, props[i]);
		}
	}
};

var css = function(elm, props) {
	if(props && elm) {
		for(var i in props) {
			elm.style[i] = props[i];
		}
	}
};

var createElm = function(tag, props, append_to) {
	var elm = document.createElement(tag);
	if(props) {
		attr(elm, props);
	}
	if(append_to) {
		append_to.appendChild(elm);
	}
	return elm;
};

// inherit one object from another
var inherit = function (Child, Parent) {
	var F = function() { };
	F.prototype = Parent.prototype;
	Child.prototype = new F();
	Child.prototype.constructor = Child;
	Child.superclass = Parent.prototype;
};

// trace
var t = function(msg) {
	if(typeof console != 'undefined') {
		console.log('[' + (new Date).toLocaleTimeString() + '] ' + msg);
	}
};

// override default object properties
var override = function(o1, o2) {
	if(typeof o2 == 'object') {
		for(var i in o2) {
			if(typeof o1[i] != 'undefined') {
				o1[i] = o2[i];
			}
		}
	}
};

// baseObject: define object events, bind to these events outside, fire them
var baseObject = function() {
	var oself = this;
	oself.events = {};
	for(var i=0; i<arguments.length; i++) {
		oself.events[arguments[i]] = [];
	}
	oself.opts = {};
};
baseObject.prototype.bind = function (e, handler, obj) {
	var oself = this;
	if(typeof oself.events[e] != 'undefined') {
		oself.events[e].push({func: handler, ctx: obj});
	}
	return oself;
};
baseObject.prototype.unbind = function (e, handler) {
	var oself = this;
	if(typeof oself.events[e] != 'undefined') {
		if(typeof handler == 'undefined') {
			oself.events[e] = [];
			return;
		}
		for(var i = 0; i < oself.events[e].length; i++) {
			if(oself.events[e][i]['func'] === handler) {
				oself.events[e].splice(i, 1);
			}
		}
	}
	return oself;
};
baseObject.prototype.broadcast = function () {
	var oself = this;
	var e = arguments[0];
	var args = [];
	for(var i=1; i<arguments.length; i++) {
		args.push(arguments[i]);
	}
	if(typeof oself.events[e] != 'undefined') {
		for(var i = 0; i < oself.events[e].length; i++) {
			oself.events[e][i]['func'].apply(oself.events[e][i]['ctx'], args);
		}
	}
};
baseObject.prototype.set = function(opts) {
	override(this.opts, opts);
	return this;
};

// we do not use bitwise operators to avoid numbers conversion to signed int32
var adler32 = function(data) {
	var base = 0xFFF1;
	var s1 = 0x1;
	var s2 = 0x0;
	for(var i = 0; i < data.length; i++) {
		s1 = (s1 + data.charCodeAt(i)) % base;
		s2 = (s2 + s1) % base;
	}
	return s2 * Math.pow(2, 16) + s1;
};

// convert string version like 9.0.124 to number 9.0000000124 where each position after dot is replaced by zero-padded 5 digits
var sver2nver = function(sver) {
	var aver = sver.match(/\d+/g);
	var nver = parseInt(aver.shift());
	for(var i = 0, s; s = aver[i++];) {
		nver += s * Math.pow(0.00001, i);
	}
	return nver;
};
// main object
lwu = {
	instances: {}, // uploader instances
	idx: 0, // uploader instance counter
	t: t, // make trace method available outside
	ERROR_CODES: {
		HTTP_ERROR: 1,
		IO_ERROR: 2,
		SEQURITY_ERROR: 3,
		OTHER_ERROR: 4
	},
	mime2ext: { // default mapping of mime types to extensions
		image:			['jpg', 'jpeg', 'bmp', 'gif', 'png', 'tiff', 'ico'],
		audio:			['mp3', 'wma', 'wav', 'ogg', 'mid'],
		video:			['mp4', 'wmv', 'avi', 'mkv', 'flv', 'mpg', 'mpeg', 'mov'],
		application:	['exe', 'rar', 'zip', 'doc', 'pdf', 'rtf', 'xls', 'ppt', 'tar', 'gz', 'z', 'js', 'dll', 'swf'],
		text:			['txt', 'css', 'html']
	},
	// we don't know name of the frontend object, so we can't call any fe method from plugin directly
	// instead, we call fe method using proxy inside main object
	callFEMethod: function(/*uploader_idx, frontend_idx, methodName, params*/) {
		var uploader_idx = Array.prototype.shift.call(arguments);
		var frontend_idx = Array.prototype.shift.call(arguments);
		var methodName = Array.prototype.shift.call(arguments);
		var fe = this.instances[uploader_idx].frontends[frontend_idx];
		return fe[methodName].apply(fe, arguments);
	},
	// main uploader object
	uploader: function(opts) {
		var oself = this;
		lwu.instances[++lwu.idx] = this;
		lwu.uploader.superclass.constructor.apply(oself, [
			'onInit',
			'onSelect',
			'onStart',
			'onProgress',
			'onDone',
			'onError',
			'onCancel'
		]); // call baseObject constructor with events list

		oself.opts.initTimeout = 5000;
		oself.opts.width = 0;
		oself.opts.height = 0;
		oself.opts.buttonText = '';
		oself.opts.buttonURL = '';
		oself.opts.accept = '';
		oself.opts.container = wnd;
		oself.opts.maxConcurrentUploads = 1; // 0 for unlimited
		override(oself.opts, opts);

		oself.initTimer = null;
		oself.frontends = [];
		oself.fe = null; // frontend which will be used
		oself.files = []; // files queue
		var UPLOAD_QUEUED = 1;
		var UPLOAD_PREPARED = 2;
		var UPLOAD_INPROGRESS = 3;
		var UPLOAD_DONE = 4;
		var UPLOAD_FAILED = 5;

		oself.addFE = function(fe) {
			fe.uploader_idx = lwu.idx;
			fe.frontend_idx = oself.frontends.length;
			fe.html_obj_id = fe.codename + '_uploader_' + fe.uploader_idx;
			fe.set({
				width: oself.opts.width,
				height: oself.opts.height,
				buttonText: oself.opts.buttonText,
				buttonURL: oself.opts.buttonURL,
				accept: oself.opts.accept,
				container: oself.opts.container
			});
			oself.frontends.push(fe);
			fe.bind('onInit', function(fe) {
				oself.chooseFE(fe);
			}).bind('onSelect', function(fo) {
				oself.broadcast('onSelect', fo);
			}).bind('onStart', function(fo) {
				oself.broadcast('onStart', fo);
			}).bind('onProgress', function(fo) {
				oself.broadcast('onProgress', fo);
			}).bind('onDone', function(fo, rsp) {
				oself.broadcast('onDone', fo, rsp);
				fo.state = UPLOAD_DONE;
				oself.startNextUpload();
			}).bind('onError', function(fo, code) {
				oself.broadcast('onError', fo, code);
				fo.state = UPLOAD_FAILED;
				oself.startNextUpload();
			}).bind('onPrepared', function(fo) { // internal event
				oself.broadcast('onPrepared', fo);
				fo.state = UPLOAD_PREPARED;
				oself.startNextUpload();
			}).bind('onCancel', function(fo) {
				oself.broadcast('onCancel', fo);
				for(var i=0; i<oself.files.length; i++) {
					if(oself.files[i].id == fo.id) {
						oself.files.splice(i, 1);
						break;
					}
				}
				oself.startNextUpload();
			});
			return oself;
		};
		oself.chooseFE = function(fe) {
			if(!oself.initTimer) {
				return;
			}
			var i = 0;
			for(i=0; i<oself.frontends.length; i++) {
				if(fe) {
					if(oself.frontends[i].init_result <= FE_INIT_INPROGRESS) {
						break; // break if this is not timeout call and we have notstarted or inprogress fe
					}
				}
				if(oself.frontends[i].init_result == FE_INIT_SUCCESS) { // choose first successfull frontend
					oself.fe = oself.frontends[i];
					break;
				}
			}
			if(oself.fe || (!oself.fe && i == oself.frontends.length)) {
				clearTimeout(oself.initTimer); // just to be sure
				oself.initTimer = null;
				oself.broadcast('onInit', oself.fe);
				for(i=0; i<oself.frontends.length; i++) { // remove from page all frontends except choosed one
					if(oself.fe && oself.frontends[i].codename == oself.fe.codename) {
						continue;
					}
					oself.frontends[i].removeFromPage();
				}
			}
		};
		oself.init = function() {
			oself.initTimer = setTimeout(function(){ oself.chooseFE() }, oself.opts.initTimeout);
			for(var i=0; i<oself.frontends.length; i++) {
				oself.frontends[i].init_result = FE_INIT_INPROGRESS;
				oself.frontends[i].init(); // TODO: html5 fe starts very quickly so other fe's don't removed from the page
			}
		};
		oself.enqueueUpload = function(fo, url, data) {
			fo.url = url;
			fo.data = data;
			fo.state = UPLOAD_QUEUED;
			oself.files.push(fo);
			oself.fe.addFile(fo);
			oself.startNextUpload();
		};
		oself.startNextUpload = function() {
			if(oself.opts.maxConcurrentUploads > 0) {
				var inprogress = 0;
				for(var i=0; i<oself.files.length; i++) {
					if(oself.files[i].state == UPLOAD_INPROGRESS) {
						++inprogress;
					}
				}
				if(inprogress >= oself.opts.maxConcurrentUploads) {
					return;
				}
			}
			for(var i=0; i<oself.files.length; i++) {
				if(oself.files[i].state == UPLOAD_PREPARED) {
					var fo = oself.files[i];
					fo.state = UPLOAD_INPROGRESS;
					oself.fe.startUpload(fo.id, fo.url, fo.data);
					break;
				}
			}
		};
		oself.cancelUpload = function(id) {
			oself.fe.cancelUpload(id);
		};
		oself.setEnabled = function(flag) {
			oself.fe.setEnabled(flag);
		};

		return oself;
	}
};

inherit(lwu.uploader, baseObject);

/*
 * upFE (upload frontend) is an abstract class, each real frontend should inherit from it
 * upFE should support following methods:
 *   init() - start FE, i.e. check preconditions and fire onInit event
 *   startUpload(id) - start upload of the file specified by id (id is an unique number got from onSelect event)
 *   cancelUpload(id) - stop upload of the file and delete file from internal queue
 *   setEnabled(true/false) - enable or disable browse button
 * and following events:
 *   onInit - fe initialization is completed
 *   onSelect - file selected by user
 *   onStart - fires before upload start
 *   onProgress - fires periodically to indicate upload progress
 *   onDone - upload completed succesfully
 *   onError - upload finished with error
 *   onPrepared - file is ready to be uploaded, valid only for html fe now, event fires after file hash is calculated
 */
var upFE = function() {
	upFE.superclass.constructor.apply(this, [
		'onInit',
		'onSelect',
		'onStart',
		'onProgress',
		'onDone',
		'onError',
		'onCancel',
		'onPrepared',
	]); // call baseObject constructor with events list
	// default options
	this.opts.container = wnd;
	this.opts.width = '';
	this.opts.height = '';
	this.opts.buttonText = '';
	this.opts.buttonURL = '';
	this.opts.accept = '';

	this.uploader_idx = 0;
	this.frontend_idx = 0;
	this.codename = 'default';
	this.init_result = FE_INIT_NOTSTARTED;
	this.files = []; // information of all uploads
};
inherit(upFE, baseObject);

upFE.prototype.init = function() {
	if(this.isFEAvailable()) {
		this.insert();
		return true;
	}
	this.init_result = FE_INIT_FAIL;
	this.broadcast('onInit', this);
	return false;
};

upFE.prototype.isFEAvailable = function() {
	alert('isFEAvailable() method is not implemented');
};
upFE.prototype.insert = function() {
	alert('insert() method is not implemented');
};
upFE.prototype.onFEReady = function() {
	t('upFE: onFEReady, codename=' + this.codename);
	this.init_result = FE_INIT_SUCCESS;
	this.broadcast('onInit', this);
};
upFE.prototype.startUpload = function(id, url, data) {
	alert('startUpload() method is not implemented');
};
upFE.prototype.cancelUpload = function(id) {
	alert('cancelUpload() method is not implemented');
};
upFE.prototype.setEnabled = function(flag) {
	alert('setEnabled() method is not implemented');
};
upFE.prototype.getFile = function(id) {
	if(id) {
		for(var i = 0; i < this.files.length; i++) {
			if(this.files[i].id == id) {
				return this.files[i];
			}
		}
	}
};
upFE.prototype.addFile = function(obj) {
	if(typeof obj != 'undefined') {
		this.files.push(obj);
	}
};
upFE.prototype.delFile = function(id) {
	if(id) {
		for(var i = 0; i < this.files.length; i++) {
			if(this.files[i].id == id) {
				this.files.splice(i, 1);
				break;
			}
		}
	}
};
upFE.prototype.removeFromPage = function() {
	var obj = gebi(this.html_obj_id);
	if(obj) {
		obj.parentNode.removeChild(obj);
	}
};

// html5 frontend
var upFE_html5 = function(opts) {
	var oself = this;
	upFE_html5.superclass.constructor.apply(this); // call upFE constructor

	oself.codename = 'html5';
	oself.blobSliceFixed = false; // special flag to indicate whether Blob.prototype.slice method already match new semantics

	oself.opts.minChunkSize = 50 * 1024;
	oself.opts.maxChunkSize = 500 * 1024;
	oself.opts.maxChunkRetries = 10;
	oself.opts.retryTimeoutBase = 5000;
	oself.opts.numPoints = 100; // number of chunks used to calc file hash
	oself.opts.maxPartSize = 10 * 1024; // max size of one chunk to calc file hash
	override(oself.opts, opts);

	var CALC_HASH_NOTSTARTED = 0;
	var CALC_HASH_INPROGRESS = 1;
	var CALC_HASH_DONE = 2;

	var userStorage = {
		// all modern browsers have native JSON implementation, but if users browser is old - html5 frontend has no chance to start
		get: function(fo) {
			var val = {};
			try {
				val = JSON.parse(localStorage.getItem(fo.hashsum));
			} catch(e) {};
			return val;
		},
		set: function(fo) {
			var val = '';
			try {
				val = JSON.stringify({
					url: fo.url,
					sessionID: fo.sessionID,
					uploadedRange: fo.uploadedRange,
					createdOn: (new Date()).getTime()
				});
			} catch(e) {};
			if(fo.hashsum) {
				localStorage.setItem(fo.hashsum, val);
			}
		},
		del: function(fo) {
			localStorage.removeItem(fo.hashsum);
		}
	};

	oself.isFEAvailable = function() {
		if(wnd.File && wnd.FileList && wnd.XMLHttpRequestUpload && (wnd.Blob || wnd.FormData)) { // check File, XmlHttpRequest2 and Blob or FormData existance
			return true;
		}
		return false;
	};
	oself.insert = function() {
		if(oself.opts.accept) {
			var accept = [];
			var filters = oself.opts.accept.split(',');
			for(var i in filters) {
				var mime = filters[i].replace(/\s+/, '');
				if(lwu.mime2ext[mime]) {
					accept.push(mime);
				}
			}
			oself.opts.accept_fixed = accept.join(',');
		}
		oself.div_elm = createElm('div', {id: oself.html_obj_id}, oself.opts.container);
		css(oself.div_elm, {
			width: oself.opts.width,
			height: oself.opts.height,
			backgroundImage: 'url(' + oself.opts.buttonURL + ')'
		});
		oself.recreateButton();
		oself.onFEReady(); // call manualy, we have not to wait anything else
	};
	oself.recreateButton = function() {
		t('recreateButton!!!');
		var file_elm_id = oself.html_obj_id + '_input';
		try { // try to delete old input if any
			if(oself.file_elm) {
				oself.file_elm.parentNode.removeChild(oself.file_elm);
			}
		} catch(e) {};
		oself.file_elm = createElm('input', {
			id: file_elm_id,
			type: 'file',
			multiple: true,
			accept: oself.opts.accept_fixed ? oself.opts.accept_fixed : ''
		}, oself.div_elm);
		css(oself.file_elm, {
			width: '100%',
			opacity: 0
		});
		oself.file_elm.onchange = function() {
			oself.onSelect(this); // 'this' is a DOM object here
		}
	};
	oself.onSelect = function(obj) {
		if(oself.blobSliceFixed == false) { // call once to fix slice method
			oself.fixBlobSlice(obj.files);
			oself.blobSliceFixed = true;
		}
		for(var i = 0; i < obj.files.length; i++) {
			var fo = obj.files[i];
			fo.id = fo.sessionID = Math.round(Math.random() * 100000000);
			fo.loaded = 0;
			fo.currentChunkStartPos = fo.currentChunkEndPos = 0;
			fo.url = '';
			fo.responseText = '';
			fo.uploadedRange = '';
			fo.calc_hash_state = CALC_HASH_NOTSTARTED;
			oself.broadcast('onSelect', fo);
		}
		oself.recreateButton(); // recreate button to avoid second upload during form posting in case of button is inside form
	};
	oself.fixBlobSlice = function(files) {
		if(wnd.Blob) {
			var origBlobSlice, origFileSlice, test_blob;
			if(Blob.prototype.slice) { // method exists, let's check it
				if(wnd.BlobBuilder) {
					test_blob = (new BlobBuilder()).append("abc").getBlob();
				} else { // use bad method: find file for test where filesize is at least 3 bytes!!!
				    for (var i = 0, f; f = files[i++];) {
						if(f.size > 2) {
							test_blob = f;
							break;
						}
					}
				}
				if(test_blob && test_blob.slice(1, 1).size != 0) { // slice is an old-semantic slice
					origBlobSlice = Blob.prototype.slice;
					Blob.prototype.slice = function(start, end, contentType) {
						return origBlobSlice.apply(this, [start, end - start, contentType]);
					}
					if(File.prototype.slice !== Blob.prototype.slice) { // this is needed for Firefox 4.0.0
						origFileSlice = File.prototype.slice;
						File.prototype.slice = function(start, end, contentType) {
							return origFileSlice.apply(this, [start, end - start, contentType]);
						}
					}
				}
			} else if(Blob.prototype.webkitSlice || Blob.prototype.mozSlice) { // new-semantic function, just use it
				/*
				// We can't do like this because of in FF we get exception "Illegal operation on WrappedNative prototype object" while calling fake slice method
				origBlobSlice = Blob.prototype.webkitSlice || Blob.prototype.mozSlice;
				Blob.prototype.slice = function(start, end, contentType) {
					return origBlobSlice.apply(this, [start, end, contentType]);
				}
				*/
				if(Blob.prototype.webkitSlice) {
					origBlobSlice = 'webkitSlice';
				} else if(Blob.prototype.mozSlice) {
					origBlobSlice = 'mozSlice';
				}
				Blob.prototype.slice = function(start, end, contentType) {
					return this[origBlobSlice].apply(this, [start, end, contentType]);
				}
			}
		}
	};
	oself.addFile = function(fo) {
		upFE_html5.superclass.addFile.apply(oself, [fo]);
		oself.calcChunkSize(fo);
		oself.calcFileHash(); // run calculation for next file
	};
	oself.calcChunkSize = function(fo) {
		fo.chunkSize = Math.floor(fo.size / 100);
		if (fo.chunkSize < oself.opts.minChunkSize) {
			fo.chunkSize = oself.opts.minChunkSize;
		}
		if (fo.chunkSize > oself.opts.maxChunkSize) {
			fo.chunkSize = oself.opts.maxChunkSize;
		}
	};
	oself.startUpload = function(id, url, data) {
		var fo = oself.getFile(id);
		fo.url = url; // at this moment url already fetched from localStorage if info presents
		fo.data = data;
		fo.full_url = fo.url + (fo.url.match(/\?/) ? '&' : '?') + fo.data;
		fo.retry = oself.opts.maxChunkRetries;
		oself.broadcast('onStart', fo);
		oself.uploadFile(fo);
	};
	oself.retryUpload = function(fo) {
		fo.retry--;
		if(fo.retry > 0) {
			var timeout = oself.opts.retryTimeoutBase * (oself.opts.maxChunkRetries - fo.retry);
			setTimeout(function() {
				oself.uploadFile(fo);
			}, timeout);
		} else {
			oself.broadcast('onError', fo, lwu.ERROR_CODES.OTHER_ERROR);
		}
	};
	oself.uploadFile = function(fo) {
		oself.calcNextChunkRange(fo);
		var blob, simple_upload = 0;
		try {
			blob = fo.slice(fo.currentChunkStartPos, fo.currentChunkEndPos + 1);
		} catch(e) { // Safari doesn't support Blob.slice method
			blob = new FormData(); // FormData should exists - this was checked in isFEAvailable method
			blob.append('Filedata', fo);
			simple_upload = 1;
		};
		fo.xhr = new XMLHttpRequest();
		fo.xhr.onreadystatechange = function() {
			if(this.readyState == 4) {
				try {
					if(this.status == 201) { // chunk was uploaded succesfully
						var range = this.responseText;
						try { // getResponseHeader throws exception during cross-domain upload, but this is most reliable variant
							range = this.getResponseHeader('Range');
						} catch(e) {};
						if(!range) {
							throw new Error('No range in 201 answer');
						}
						fo.uploadedRange = range; // store range for case of later retry
						fo.retry = oself.opts.maxChunkRetries; // restore retry counter
						userStorage.set(fo); // add or update file info in localStorage
						oself.uploadFile(fo);
					} else if(this.status == 200) {
						fo.responseText = this.responseText;
						fo.loaded = fo.size; // all bytes were uploaded
						userStorage.del(fo); // delete file info from localStorage
						oself.broadcast('onDone', fo, fo.responseText);
					} else if(this.status == 0 && fo.cancel == 1) {
						//t('Aborted uploading for id=' + fo.id);
					} else {
						throw new Error('Bad http answer code');
					}
				} catch(e) { // any exception means that we need to retry upload
					oself.retryUpload(fo);
				};
			}
		};
		fo.xhr.open("POST", fo.full_url, true);
		fo.xhr.upload.onprogress = function(evt) {
			fo.loaded = (simple_upload ? 0 : fo._loaded) + evt.loaded;
			oself.broadcast('onProgress', fo);
		};
		if(!simple_upload) {
			fo.xhr.setRequestHeader('Session-ID', fo.sessionID);
			fo.xhr.setRequestHeader('Content-Disposition', 'attachment; filename="' + encodeURI(fo.name) + '\"');
			fo.xhr.setRequestHeader('Content-Range', 'bytes ' + fo.currentChunkStartPos + '-' + fo.currentChunkEndPos + '/' + fo.size);
			fo.xhr.setRequestHeader('Content-Type', 'application/octet-stream');
		}
		fo.xhr.withCredentials = true; // allow cookies to be sent
		fo.xhr.send(blob);
	};
	oself.calcNextChunkRange = function(fo) {
		var range = fo.uploadedRange;
		fo.currentChunkStartPos = 0;
		fo.currentChunkEndPos = (fo.currentChunkStartPos + fo.chunkSize < fo.size ? fo.currentChunkStartPos + fo.chunkSize : fo.size - 1);
		fo.loaded = fo._loaded = 0;
		if(!range || range.match(/^\d+-\d+\/\d+/)) {
			var holeStart = 0, holeEnd = 0;
			var arange = (range ? range.split(',') : []);
			for(var r in arange) {
				var rr = arange[r].split('/')[0].split('-');
				var start = parseInt(rr[0]), end = parseInt(rr[1]);
				fo.loaded += end - start;
				if (holeEnd != 0) {
					continue;
				}
				if (start != 0) {
					holeEnd = start - 1;
				} else {
					holeStart = end + 1;
				}
			}
			fo._loaded = fo.loaded; // save loaded bytes for smooth progress
			fo.currentChunkStartPos = holeStart;
			if (holeEnd == 0) {
				holeEnd = fo.size - 1;
			}
			fo.currentChunkEndPos = (holeEnd - holeStart < fo.chunkSize ? holeEnd : fo.currentChunkStartPos + fo.chunkSize);
		}
		oself.broadcast('onProgress', fo);
	};
	oself.cancelUpload = function(id) {
		var fo = oself.getFile(id);
		fo.cancel = 1; // temporary flag
		if(fo.xhr) {
			fo.xhr.abort();
		}
		oself.delFile(id);
		oself.broadcast('onCancel', fo);
	};
	oself.calcFileHash = function() {
		var fo;
		for(var i = 0; i < oself.files.length; i++) {
			if(oself.files[i].calc_hash_state == CALC_HASH_INPROGRESS) { // hash for one file can be calculated at the same time
				return;
			}
			if(!fo && oself.files[i].calc_hash_state == CALC_HASH_NOTSTARTED) { // choose first file for the next calculation
				fo = oself.files[i];
			}
		}
		if(!fo) {
			return;
		}
		var current_point = -1; // will be 0 at first interation
		var part_size = (fo.size / oself.opts.numPoints < oself.opts.maxPartSize ? fo.size / oself.opts.numPoints : oself.opts.maxPartSize);
		var file_pos = 0;
		fo.hashsum = '';

		function do_calc() {
			file_pos = Math.floor(++current_point * fo.size / oself.opts.numPoints);
			if(current_point >= oself.opts.numPoints) {
				override(fo, userStorage.get(fo)); // fetch info from localStorage and update file with it
				fo.calc_hash_state = CALC_HASH_DONE;
				oself.broadcast('onPrepared', fo);
				setTimeout(function() {
					oself.calcFileHash(); // run calculation for next file
				}, 1);
				return;
			}
			var r = new FileReader();
			r.onload = function() {
				fo.hashsum += adler32(this.result);
				do_calc();
			};
			r.onerror = function() {
				fo.hashsum = ''; // clear partially calculated sum
				current_point = oself.opts.numPoints; // artificially break calculation loop
				do_calc();
			};
			r.readAsBinaryString(fo.slice(file_pos, file_pos + part_size));
		};
		if(!wnd.FileReader) {
			current_point = oself.opts.numPoints; // artificially break calculation loop
		}
		fo.calc_hash_state = CALC_HASH_INPROGRESS;
		do_calc(); // start calc
	};
	oself.setEnabled = function(flag) {
		if(flag) { // enable button
			oself.div_elm.style.opacity = 1;
			oself.file_elm.disabled = false;
		} else { // disable button
			oself.div_elm.style.opacity = 0.5;
			oself.file_elm.disabled = true;
		}
	};

	return oself;
};
inherit(upFE_html5, upFE);
lwu.upFE_html5 = upFE_html5;

// common class for plugin frontends
var upFE_plugin = function() {
	upFE_plugin.superclass.constructor.apply(this); // call upFE constructor
	this.opts.plugin_url = ''; // additional option for plugin frontend
};
inherit(upFE_plugin, upFE);

upFE_plugin.prototype.onSelect = function(id, name, size) {
	var fo = {};
	fo.id = id;
	fo.name = name;
	fo.size = size;
	fo.loaded = 0;
	this.broadcast('onSelect', fo);
	this.broadcast('onPrepared', fo); // simulate event
};
upFE_plugin.prototype.onProgress = function(id, loaded, total) {
	var fo = this.getFile(id);
	fo.loaded = loaded;
	this.broadcast('onProgress', fo);
};
upFE_plugin.prototype.onDone = function(id, rsp) {
	this.broadcast('onDone', this.getFile(id), rsp);
};
upFE_plugin.prototype.onError = function(id, errorCode, errorText) {
	this.broadcast('onError', this.getFile(id), errorCode);
};
upFE_plugin.prototype.startUpload = function(id, url, data) {
	this.broadcast('onStart', this.getFile(id));
	var oself = this;
	// use timeout to prevent "Error calling NPObject function" in case of calling plugin method from JS function called by plugin
	setTimeout(function() {
		oself.plugin_api.startUpload(id, url, data);
	}, 1);
};
upFE_plugin.prototype.cancelUpload = function(id) {
	this.broadcast('onCancel', this.getFile(id));
	var oself = this;
	// use timeout to prevent "Error calling NPObject function" in case of calling plugin method from JS function called by plugin
	setTimeout(function() {
		oself.plugin_api.cancelUpload(id);
	}, 1);
};
upFE_plugin.prototype.setEnabled = function(flag) {
	this.plugin_api.setEnabled(flag);
};
upFE_plugin.prototype.getAcceptString = function() {
	var accept = [];
	this.opts.accept = this.opts.accept.replace(/\s+/, '');
	if(this.opts.accept) {
		var filters = this.opts.accept.split(',');
		for(var i in filters) {
			var ext = lwu.mime2ext[filters[i]];
			for(var j in ext) {
				ext[j] = '*.' + ext[j];
			}
			if(ext) {
				accept.push(filters[i] + '|' + ext.join(';'));
			}
		}
	}
	return accept.join('@');
};

// flash frontend
var upFE_flash = function(opts) {
	var oself = this;
	upFE_flash.superclass.constructor.apply(this); // call upFE_plugin constructor

	oself.codename = 'flash';
	override(oself.opts, opts);

	var needed_ver = '9.0.28';

	oself.insert = function() {
		var obj = createElm('object', {
			id: oself.html_obj_id,
			type: 'application/x-shockwave-flash',
			data: oself.opts.plugin_url,
			width: oself.opts.width,
			height: oself.opts.height
		}, oself.opts.container);
		createElm('param', {
			name: 'movie',
			value: oself.opts.plugin_url
		}, obj);
		createElm('param', {
			name: 'allowscriptaccess',
			value: 'always'
		}, obj);
		createElm('param', {
			name: 'flashvars',
			value: 'uploaderID=' + oself.uploader_idx + '&frontentID=' + oself.frontend_idx + '&htmlProxyName=lwu&browseText=' + oself.opts.buttonText + '&buttonURL=' + oself.opts.buttonURL + '&accept=' + oself.getAcceptString()
		}, obj);
	};
	oself.isFEAvailable = function() {
		var version;
		try {
			version = navigator.plugins['Shockwave Flash'];
			version = version.description;
		} catch (e1) {
			try {
				version = new ActiveXObject('ShockwaveFlash.ShockwaveFlash').GetVariable('$version');
			} catch (e2) {
				version = '0.0.00';
			}
		}
		return sver2nver(version) >= sver2nver(needed_ver);
	};
	oself.onFEReady = function() {
		oself.plugin_api = gebi(oself.html_obj_id);
		upFE_flash.superclass.onFEReady.apply(oself);
		return true; // returning true allow plugin to detect call correctness
	};
};
inherit(upFE_flash, upFE_plugin);
lwu.upFE_flash = upFE_flash;

// silverlight frontend
var upFE_silverlight = function(opts) {
	var oself = this;
	upFE_silverlight.superclass.constructor.apply(this); // call upFE_plugin constructor

	oself.codename = 'silverlight';
	override(oself.opts, opts);

	var needed_ver = '3.0.40818.0'; // needed sl version

	oself.insert = function() {
		var obj = createElm('object', {
			id: oself.html_obj_id,
			type: 'application/x-silverlight-2',
			data: 'data:application/x-silverlight,',
			width: oself.opts.width,
			height: oself.opts.height
		}, oself.opts.container);
		createElm('param', {
			name: 'source',
			value: oself.opts.plugin_url
		}, obj);
		createElm('param', {
			name: 'minRuntimeVersion',
			value: needed_ver
		}, obj);
		createElm('param', {
			name: 'enableHtmlAccess',
			value: true
		}, obj);
		createElm('param', {
			name: 'autoUpgrade',
			value: true
		}, obj);
		createElm('param', {
			name: 'initParams',
			value: 'uploaderID=' + oself.uploader_idx + ',frontentID=' + oself.frontend_idx + ',htmlProxyName=lwu,browseText=' + oself.opts.buttonText + ',buttonURL=' + oself.opts.buttonURL + ',accept=' + oself.getAcceptString()
		}, obj);
	};
	oself.isFEAvailable = function() {
		var rv = false;
		try {
			var ver = navigator.plugins['Silverlight Plug-In'];
			if(sver2nver(ver.description) >= sver2nver(needed_ver)) {
				rv = true;
			}
		} catch (e1) {
			try {
				sl = new ActiveXObject('AgControl.AgControl');
				if(sl.IsVersionSupported(needed_ver)) {
					rv = true;
				}
			} catch (e2) {}
		}
		return rv;
	};
	oself.onFEReady = function() {
		oself.plugin_api = gebi(oself.html_obj_id).content.API;
		upFE_silverlight.superclass.onFEReady.apply(oself);
		return true; // returning true allow plugin to detect call correctness
	};
};
inherit(upFE_silverlight, upFE_plugin);
lwu.upFE_silverlight = upFE_silverlight;

return lwu;

})(window);
