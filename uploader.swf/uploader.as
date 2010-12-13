System.security.allowDomain("*");
import flash.net.FileReference;
import flash.net.FileReferenceList;
import flash.external.*;// ExternalInterface

// Error codes
var HTTP_ERROR = 1;
var IO_ERROR = 2;
var SEQURITY_ERROR = 3;
var OTHER_ERROR = 4;

// variables which are passed as FlashVars
var uploaderID;
var frontentID;
var htmlProxyName;
var buttonURL;
var browseText;
var accept;

// global variables
var browseButtonMC:MovieClip = _browseButton;
var browseTextMC:TextField = _browseText;
var FileRefArray:Array = new Array();
var URLReqArray:Array = new Array();
var FileRefList:FileReferenceList;

function callJS() {
	arguments.unshift(frontentID);
	arguments.unshift(uploaderID);
	arguments.unshift(htmlProxyName + '.callFEMethod');
	if (ExternalInterface.available) {
		return ExternalInterface.call.apply(null, arguments);
	}
	return null;
}
function setButtonVisibility(st:Boolean) {
	if (st) {
		browseButtonMC._visible = true;
		browseTextMC._visible = true;
	} else {
		browseButtonMC._visible = false;
		browseTextMC._visible = false;
	}
}
function setButtonEnablity(st:Boolean) {
	if (st) {
		browseButtonMC.enabled = true;
		browseTextMC.textColor = 0x000000;
		browseButtonMC._alpha = 100;
	} else {
		browseButtonMC.enabled = false;
		browseTextMC.textColor = 0xCCCCCC;
		browseButtonMC._alpha = 50;
	}
}
function findIndexById(id:Number, arr:Array) {
	for (var i:Number = 0; i<arr.length; i++) {
		if (arr[i].id eq id) {
			return i;
		}
	}
	return null;
}

function callback_select(id:Number, fName:String, fSize:Number, timestamp:Number, fCount:Number) {
	callJS('onSelect', id, fName, fSize, timestamp, fCount);
}
function callback_progress(id:Number, bytesLoaded:Number, bytesTotal:Number) {
	callJS('onProgress', id, bytesLoaded, bytesTotal);
}
function callback_complete_data(id:Number, serverdata:String, filesize:Number) {
	callJS('onDone', id, serverdata, filesize);
}
function callback_error(id:Number, errCode:Number, errStr:String) {
	callJS('onError', id, errCode, errStr);
}

function createListener(id:Number) {
	var listener:Object = new Object();
	listener.onSelect = function(fileRefList:FileReferenceList):Void  {
		var timestamp = new Date().getTime();
		for (var i:Number = 0; i<fileRefList.fileList.length; i++) {
			var file:Object = new Object();
			file.id = Number(new Date().valueOf()+Math.round(Math.random()*10000000));// generate id
			file.fileRef = fileRefList.fileList[i];
			file.fileRef.addListener(createListener(file.id));
			FileRefArray.push(file);
			callback_select(file.id, file.fileRef.name, file.fileRef.size, timestamp, fileRefList.fileList.length);
		}
	};
	listener.onProgress = function(file:FileReference, bytesLoaded:Number, bytesTotal:Number):Void  {
		callback_progress(id, bytesLoaded, bytesTotal);
	};
	listener.onUploadCompleteData = function(file:FileReference, serverdata:String):Void  {
		callback_complete_data(id, serverdata, file.size);
	};
	listener.onHTTPError = function(file:FileReference, httpError:Number):Void  {
		callback_error(id, HTTP_ERROR, httpError+"");
	};
	listener.onIOError = function(file:FileReference):Void  {
		callback_error(id, IO_ERROR, "IO_ERROR");
	};
	listener.onSecurityError = function(file:FileReference, errorString:String):Void  {
		callback_error(id, SEQURITY_ERROR, errorString);
	};
	return listener;
}
function startUpload(id:Number, url:String, additionalData:String) {
	if (id && (index = findIndexById(id, FileRefArray)) != null) {
		var file = FileRefArray[index];
		file.fileRef.postData = additionalData;
		var my_array = url.split("&amp;");
		if (my_array.length>0) {
			file.uploadURL = my_array.join("&");
		} else {
			file.uploadURL = url;
		}
		if (!file.fileRef.upload(file.uploadURL, "Filedata")) {
			callback_error(file.id, OTHER_ERROR, "Can't start upload");
		}
	} else {
		callback_error(id, OTHER_ERROR, "Can't find file with id=" + id);
	}
}
function cancelUpload(id:Number) {
	if (id) {
		index = findIndexById(id, FileRefArray);
	}
	if (index != null) {
		FileRefArray[index].fileRef.cancel();
		delete FileRefArray[index].fileRef;
		FileRefArray.splice(index, 1);
	}
}
function browse() {
	var accept_array:Array = new Array;
	if(accept) {
		var tmp:Array = accept.split('@');
		for (var i = 0; i < tmp.length; i++) {
			var title_ext:Array = tmp[i].split('|');
			accept_array.push({description:title_ext[0], extension:title_ext[1]});
		}
	}
	if(accept_array.length == 0) {
		accept_array.push({description:"all files", extension:"*.*"});
	}
	_root.FileRefList.browse(accept_array);
}
function onButtonCreated() {
	setButtonVisibility(true);
	setButtonEnablity(true);
	browseButtonMC.useHandCursor = false;
	browseButtonMC.onRelease = function() {
		_root.browse();
	}
	// Let's start tries to call JS callback to signal about flash ready
	var triesCounter:Number = 100;
	var intervalId:Number = setInterval(function ():Void {
		if (!triesCounter || callJS('onFEReady', 'flash', getVersion()) != null) {
			// we successfully called JS function, timer is not needed anymore
			clearInterval(intervalId);
			if (!buttonURL) { // fix button width: in IE8 Stage.width sometimes is 0 during createDefaultButton()
				browseButtonMC._width = Stage.width;
				browseTextMC._width = Stage.width;
			}
		} else {
			triesCounter--;
		}
	}, 100);
}
function createCustomButton() {
	// hide default button, browseButtonMC and browseTextMC points to default objects at this moment
	setButtonVisibility(false);
	browseButtonMC = _root.createEmptyMovieClip('_browseButtonC', _root.getNextHighestDepth());
	browseTextMC = null;

	var mcLoader:MovieClipLoader = new MovieClipLoader();
	var loadListener:Object = new Object();
	loadListener.onLoadInit = function():Void  {
		onButtonCreated();
	};
	loadListener.onLoadError = function():Void  {
		createDefaultButton();
	};
	mcLoader.addListener(loadListener);
	mcLoader.loadClip(buttonURL, browseButtonMC);
}
function createDefaultButton() {
	browseButtonMC = _browseButton;
	if(!browseText || browseText == '') {
		browseText = 'Upload';
	}
	browseTextMC.text = browseText;
	var w = Stage.width;
	var h = Stage.height;
	browseButtonMC._width = w;
	browseTextMC._width = w;
	browseButtonMC._height = h;
	browseTextMC._height = h;
	onButtonCreated();
}

ExternalInterface.addCallback("startUpload", null, startUpload);
ExternalInterface.addCallback("cancelUpload", null, cancelUpload);
ExternalInterface.addCallback("setEnabled", null, setButtonEnablity);

FileRefList = new FileReferenceList();
FileRefList.addListener(createListener(0));
_root._focusrect = false;// Disable yellow focus rectangle
Stage.scaleMode = 'noScale';
Stage.align = 'TL';

if (buttonURL) {
	createCustomButton();
} else {
	createDefaultButton();
}

// Keep Flash Player busy so it doesn't show the "flash script is running slowly" error
var counter:Number = 0;
setInterval(function():Void { if (++counter > 100) counter = 0; }, 250);

stop();
