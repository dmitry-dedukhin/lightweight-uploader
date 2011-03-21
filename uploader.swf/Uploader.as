package {
	// importing all stuff reduces swf file size a bit, strange...
	import flash.system.*;
	import flash.net.*;
	import flash.external.*;
	import fl.controls.*;
	import flash.events.*;
	import flash.utils.*;
	import flash.display.*;

	public class Uploader {
		private var tasks:Object = new Object();
		private var browseButton:Button = new Button();
		private var FileRefList:FileReferenceList = new FileReferenceList();
		private var args:Object = new Object();
		private var stage:Stage;

		/********************** Functions to call JS *********************************/
		private function onSelect(id:Number, name:String, size:Number, timestamp:Number, count:Number) {
			callJS('onSelect', id, name, size, timestamp, count);
		}
		private function onProgress(id:Number, bytesLoaded:Number, bytesTotal:Number) {
			callJS('onProgress', id, bytesLoaded, bytesTotal);
		}
		private function onDone(id:Number, data:String) {
			callJS('onDone', id, data);
		}
		private function onError(id:Number, errCode:Number, errStr:String) {
			callJS('onError', id, errCode, errStr);
		}
		/********************** Functions available for JS using ExternalInterface *********************************/
		private function startUpload(id:Number, uploadURL:String, additionalData:String) {
			if(id in tasks) {
				tasks[id].startUpload(uploadURL, additionalData);
			}
		}
		private function cancelUpload(id:Number) {
			if(id in tasks) {
				tasks[id].cancelUpload();
				delete tasks[id];
			}
		}
		private function setButtonEnablity(state:Boolean) {
			var matrix:Object = browseButton.transform.colorTransform;
			if (state) {
				browseButton.enabled = true;
				matrix.alphaMultiplier = 1;
			} else {
				browseButton.enabled = false;
				matrix.alphaMultiplier = 0.5;
			}
			browseButton.transform.colorTransform = matrix;
		}
		/********************** Constructor *********************************/
		public function Uploader(stage:Stage) {
			this.stage = stage;

			stage.stageFocusRect = false; // Disable yellow focus rectangle
			stage.scaleMode = StageScaleMode.NO_SCALE;
			stage.align = StageAlign.TOP_LEFT;
			stage.showDefaultContextMenu = false;

			Security.allowDomain("*");

			/* Parameters are:
			*  uploaderID - id of uploader instance, is used to call uploader methods
			*  frontentID - id of frontend index in internal uploader array, is used to call uploader methods
			*  htmlProxyName - name of the html object which is act as a proxy to call uploader methods
			*  buttonURL - absolute url of the button image
			*  browseText - text which will be displayed on native button
			*  accept - string with accepted file types, format: accept=image|*.jpg;*.jpeg;*.bmp@video|*.mp4;*.wmv;*.avi
			*  chunking - allow chunked (resumable) upload, false by default
			*/
			for(var p in stage.loaderInfo.parameters) {
				args[p] = stage.loaderInfo.parameters[p];
			}
			args['FileFiltersArray'] = new Array;
			if(args['accept']) {
				var tmp:Array = args['accept'].split('@');
				for (var i = 0; i < tmp.length; i++) {
					var title_ext:Array = tmp[i].split('|');
					args['FileFiltersArray'].push(new FileFilter(title_ext[0], title_ext[1]));
				}
			}
			if(args['FileFiltersArray'].length == 0) {
				args['FileFiltersArray'].push(new FileFilter("all files", "*.*"));
			}
			initButton();
			initFileRef();
			provideExternalInterface();
			notifyJS();
		}
		/********************** ExternalInterface stuff *********************************/
		public function callJS() {
			arguments.unshift(args['frontentID']);
			arguments.unshift(args['uploaderID']);
			arguments.unshift(args['htmlProxyName'] + '.callFEMethod');
			if (ExternalInterface.available) {
				return ExternalInterface.call.apply(null, arguments);
			}
			return null;
		}
		public function notifyJS() {
			var myTimer:Timer = new Timer(100, 1000); // try 1000 times with 100ms interval
			myTimer.addEventListener("timer", function() {
				if (callJS('onFEReady', 'flash', flash.system.Capabilities.version, 0) != null) {
					myTimer.stop(); // we successfully called JS function, timer is not needed anymore
				}
			});
			myTimer.start();
		}
		/********************** Functions available for JS using ExternalInterface *********************************/
		public function provideExternalInterface() {
			try {
				ExternalInterface.addCallback("startUpload", this.startUpload);
				ExternalInterface.addCallback("cancelUpload", this.cancelUpload);
				ExternalInterface.addCallback("setEnabled", this.setButtonEnablity);
			} catch(e:Error) {};
		}
		/********************** Button related stuff *********************************/
		public function initButton() {
			browseButton.label = args['browseText'];
			browseButton.setStyle("textPadding", 0); // remove default text padding
			browseButton.useHandCursor = false;

			browseButton.addEventListener(MouseEvent.CLICK, function(e:MouseEvent) {
				FileRefList.browse(args['FileFiltersArray']);
			});

			function onButtonCreated() {
				browseButton.validateNow();
				browseButton.setSize(stage.stageWidth, stage.stageHeight); // at this moment stageWidth and stageHeight has correct values in IE if object has been taken from cache
				stage.addChild(browseButton);
			}

			var mcLoader:Loader = new Loader();
			if ('buttonURL' in args) {
				mcLoader.load(new URLRequest(args['buttonURL']));
				mcLoader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(e:IOErrorEvent) {
					onButtonCreated();
				});
				mcLoader.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event) {
				    browseButton.setStyle("icon", mcLoader);
					onButtonCreated();
				});
			} else {
				onButtonCreated();
			}
		}
		/********************** Setup FileReferenceList allowing to pickup files in dialog *********************************/
		public function initFileRef() {
			FileRefList.addEventListener(Event.SELECT, function(e:Event) {
				var fileRefList:FileReferenceList = FileReferenceList(e.target);
				var timestamp = (new Date()).getTime();
				for (var i:Number = 0; i<fileRefList.fileList.length; i++) {
					var file:UploadItem;
					if(args['chunking'] && fileRefList.fileList[i].size <= Const.maxFilesizeForChunking && fileRefList.fileList[i].hasOwnProperty('load')) {
						file = new UploadItemExt(fileRefList.fileList[i]);
					} else {
						file = new UploadItem(fileRefList.fileList[i]);
					}
					tasks[file.id] = file;
					// setup calbacks
					file.onProgress = onProgress;
					file.onDone = onDone;
					file.onError = onError;
					onSelect(file.id, file.name, file.size, timestamp, fileRefList.fileList.length);
				}
			});
		}
	}
}