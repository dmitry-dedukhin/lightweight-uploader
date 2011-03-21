package {
	public final class Const {
		// Adobe officially supports reading of files up to 100mb, but 100mb file is read in ~15sec - very slow (7mb/s)
		// So, we limit max filesize by 20mb
		public static const maxFilesizeForChunking:Number = 20 * 1024 * 1024;
	    public static const maxChunkRetries:Number = 10;
		public static const retryTimeoutBase:Number = 5000;
		public static const minChunkSize:Number = 50 * 1024;
		public static const maxChunkSize:Number = 500 * 1024;
		public static const HTTP_ERROR:Number = 1; // doesn't used
		public static const IO_ERROR:Number = 2;
		public static const SEQURITY_ERROR:Number = 3;
		public static const OTHER_ERROR:Number = 4;
	}
}
