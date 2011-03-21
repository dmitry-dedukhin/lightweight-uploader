package {
	import flash.net.*;
	import flash.external.*;
	import flash.events.*;
	import flash.utils.*;

	public class UploadItemExt extends UploadItem {
		private var canceled:Boolean;
		private var uploadURL:String;
		private var additionalData:String;

		private var _super:UploadItem;
		private var chunkRetries:Number = Const.maxChunkRetries;
		private var chunkSize:Number;
		private var responseText:String;
		private var loadedRange:String;
		private var responseIs201:RegExp = /^\d+-\d+\/\d+/;
		private var retryTimer:Timer = new Timer(Const.retryTimeoutBase);

		private var currentChunkStartPos:Number = 0;
		private var currentChunkEndPos:Number = 0;

		// Constructor
		public function UploadItemExt(fileRef:FileReference) {
			super(fileRef);
			_super = super;
			chunkSize = Math.floor(file.size / 100);
			if(chunkSize < Const.minChunkSize) {
				chunkSize = Const.minChunkSize;
			}
			if(chunkSize > Const.maxChunkSize) {
				chunkSize = Const.maxChunkSize;
			}
			retryTimer.addEventListener("timer", uploadExt); // add retry event handler
		}
		// Protected Methods
		override protected function init() {
			function onError(e:IOErrorEvent) {
				_super.startUpload(this.uploadURL, this.additionalData); // rollback to ordinary upload
			}
			function onReadProgress(e:ProgressEvent) {
				onProgress(id, 0, e.bytesTotal); // report zero progress to avoid visual hanging during file reading
			}
			file.addEventListener(Event.COMPLETE, function(e:Event):void  { // reading of the file completed
				file.removeEventListener(IOErrorEvent.IO_ERROR, onError);
				file.removeEventListener(ProgressEvent.PROGRESS, onReadProgress);
				uploadExt();
			});
			file.addEventListener(IOErrorEvent.IO_ERROR, onError); // reading of the file has been failed
			file.addEventListener(ProgressEvent.PROGRESS, onReadProgress);
		}
		// Public Methods
		override public function startUpload(uploadURL:String, additionalData:String):void {
			this.uploadURL = uploadURL;
			this.additionalData = additionalData;
			file.load(); // start loading file content
			canceled = false;
		}
		override public function cancelUpload() {
			canceled = true;
		}
		// Private Methods
		private function retryUpload():void {
			--chunkRetries;
			if(chunkRetries > 0) {
				retryTimer.delay = Const.retryTimeoutBase * (Const.maxChunkRetries - chunkRetries + 1);
				retryTimer.repeatCount = 1;
				retryTimer.start();
			} else {
				onError(id, Const.IO_ERROR, "Can't upload chunk after " + Const.maxChunkRetries + " retries");
			}
		}
		private function uploadExt(e:TimerEvent = null):void { // can be called from timer
			if(canceled) {
				return;
			}
			var sign = "&";
			if(uploadURL.indexOf('?') == -1) {
				sign = "?";
			}
			var url = uploadURL + sign + additionalData;

			calcNextChunkRanges();

			var req = new URLRequest(url);
			req.method = URLRequestMethod.POST;
			req.contentType = "application/octet-stream";
			req.requestHeaders = new Array(new URLRequestHeader("Content-Disposition", "attachment; filename=\"" + encodeURI(file.name) + "\""));
			req.requestHeaders.push(new URLRequestHeader("X-Content-Range", "bytes " + currentChunkStartPos + "-" + currentChunkEndPos + "/" + file.size)); // Content-Range can't be used
			req.requestHeaders.push(new URLRequestHeader("Session-ID", id));
			req.data = new ByteArray();
			file.data.position = currentChunkStartPos;
			file.data.readBytes(req.data, 0, currentChunkEndPos - currentChunkStartPos + 1);

			var r = new URLLoader();
			r.addEventListener(Event.COMPLETE, function(e:Event):void {
				// http://www.atnan.com/2007/6/11/can-as3-do-rest-or-not
				// we can't check neither HTTP_STATUS event nor response headers, FUCKING Adobe!!!
				if(r.data && r.data.search(responseIs201) != -1) {
					chunkRetries = Const.maxChunkRetries;
					responseText = r.data;
					uploadExt();
				} else if(r.data) { // assume correct response if data presents
					onDone(id, r.data);
				} else {
					retryUpload();
				}
			});
			r.addEventListener(IOErrorEvent.IO_ERROR, function(e:IOErrorEvent):void {
				retryUpload();
			});
			r.addEventListener(SecurityErrorEvent.SECURITY_ERROR, function(e:SecurityErrorEvent):void {
				retryUpload();
			});

			try {
				r.load(req);
			} catch(err:Error) {
				onError(id, Const.OTHER_ERROR, "Can't start upload");
			}
		}
		private function calcNextChunkRanges() {
			var bytesUploaded:Number = 0;
			currentChunkStartPos = 0;
			currentChunkEndPos = (currentChunkStartPos + chunkSize < file.size ? currentChunkStartPos + chunkSize : file.size - 1);
			if (responseText && responseText.search(responseIs201) != -1) {
				loadedRange = responseText;
				var holeStart:Number = 0;
				var holeEnd:Number = 0;
				for each (var str in loadedRange.split(",")) {
					var r:Array = str.split('/')[0].split('-');
					var start:Number = new Number(r[0]);
					var end:Number = new Number(r[1]);
					bytesUploaded += end - start;
					if (holeEnd != 0) {
						continue;
					}
					if (start != 0) {
						holeEnd = start - 1;
					} else {
						holeStart = end + 1;
					}
				}
				currentChunkStartPos = holeStart;
				if (holeEnd == 0) {
					holeEnd = file.size - 1;
				}
				currentChunkEndPos = (holeEnd - holeStart < chunkSize ? holeEnd : currentChunkStartPos + chunkSize);
			}
			onProgress(id, bytesUploaded, file.size); // report progress anyway, for the first call we report 0%
		}
	}
}