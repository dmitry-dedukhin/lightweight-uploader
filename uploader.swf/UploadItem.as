package {
	import flash.net.*;
	import flash.external.*;
	import fl.controls.*;
	import flash.events.*;

	public class UploadItem {
		protected var _id:Number;
		protected var file:FileReference;

		public var onProgress:Function = function() {};
		public var onDone:Function = function() {};
		public var onError:Function = function() {};

		// Constructor
		public function UploadItem(fileRef:FileReference) {
			id = Number((new Date()).getTime() + Math.round(Math.random() * 1000000));
			file = fileRef;
			init();
		}
		// Protected Methods
		protected function init() {
			file.addEventListener(ProgressEvent.PROGRESS, function(e:ProgressEvent):void  {
				onProgress(id, e.bytesLoaded, e.bytesTotal);
			});
			file.addEventListener(DataEvent.UPLOAD_COMPLETE_DATA, function(e:DataEvent):void  {
				onDone(id, e.data);
			});
			file.addEventListener(IOErrorEvent.IO_ERROR, function(e:IOErrorEvent):void  {
				onError(id, Const.IO_ERROR, e.toString());
			});
			file.addEventListener(SecurityErrorEvent.SECURITY_ERROR, function(e:SecurityErrorEvent):void  {
				onError(id, Const.SEQURITY_ERROR, e.toString());
			});
		}
		// Public Methods
		public function get name():String {
			return file.name;
		}
		public function get size():Number {
			return file.size;
		}
		public function get id():Number {
			return _id;
		}
		public function set id(value:Number):void {
			_id = value;
		}
		public function startUpload(uploadURL:String, additionalData:String):void {
			var req = new URLRequest(uploadURL);
			req.data = additionalData;
			req.method = URLRequestMethod.POST; // for security reasons we force additionData to be passed as POST parameters because it can contains cookies
			try {
				file.upload(req, "Filedata");
			} catch(err:Error) {
				onError(id, Const.OTHER_ERROR, "Can't start upload");
			}
		}
		public function cancelUpload() {
			file.cancel();
		}
	}
}