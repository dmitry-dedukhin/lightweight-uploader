﻿using System;
using System.Windows;

namespace uploader
{
	public partial class App : Application
	{

		public App()
		{
			this.Startup += this.Application_Startup;
			this.Exit += this.Application_Exit;
			this.UnhandledException += this.Application_UnhandledException;

			InitializeComponent();
		}

		private void Application_Startup(object sender, StartupEventArgs e)
		{
			FileUploadControl uploadControl = new FileUploadControl();
			/*
						long tempLong = 0;
						if (e.InitParams.Keys.Contains("UploadChunkSize") && !string.IsNullOrEmpty(e.InitParams["UploadChunkSize"]))
						{
							if (long.TryParse(e.InitParams["UploadChunkSize"], out tempLong) && tempLong > 0)
								uploadControl.UploadChunkSize = tempLong;
						}
			*/
			uploadControl.BrowseText = "";
			uploadControl.ButtonURL = "";
			uploadControl.HtmlUploaderID = "";
			uploadControl.HtmlFrontentID = "";
			uploadControl.HtmlProxyName = "";
			if (e.InitParams.Keys.Contains("browseText") && !string.IsNullOrEmpty(e.InitParams["browseText"]))
			{
				uploadControl.BrowseText = e.InitParams["browseText"];
			}
			if (e.InitParams.Keys.Contains("buttonURL") && !string.IsNullOrEmpty(e.InitParams["buttonURL"]))
			{
				uploadControl.ButtonURL = e.InitParams["buttonURL"];
			}
			if (e.InitParams.Keys.Contains("uploaderID") && !string.IsNullOrEmpty(e.InitParams["uploaderID"]))
			{
				uploadControl.HtmlUploaderID = e.InitParams["uploaderID"];
			}
			if (e.InitParams.Keys.Contains("frontentID") && !string.IsNullOrEmpty(e.InitParams["frontentID"]))
			{
				uploadControl.HtmlFrontentID = e.InitParams["frontentID"];
			}
			if (e.InitParams.Keys.Contains("htmlProxyName") && !string.IsNullOrEmpty(e.InitParams["htmlProxyName"]))
			{
				uploadControl.HtmlProxyName = e.InitParams["htmlProxyName"];
			}
			if (e.InitParams.Keys.Contains("accept") && !string.IsNullOrEmpty(e.InitParams["accept"]))
			{
				uploadControl.FileFilter = e.InitParams["accept"].Replace('@', '|');
			}
			this.RootVisual = uploadControl;
		}

		private void Application_Exit(object sender, EventArgs e) { }

		private void Application_UnhandledException(object sender, ApplicationUnhandledExceptionEventArgs e)
		{
			// If the app is running outside of the debugger then report the exception using
			// the browser's exception mechanism. On IE this will display it a yellow alert 
			// icon in the status bar and Firefox will display a script error.
			if (!System.Diagnostics.Debugger.IsAttached)
			{
				// NOTE: This will allow the application to continue running after an exception has been thrown
				// but not handled. 
				// For production applications this error handling should be replaced with something that will 
				// report the error to the website and stop the application.
				e.Handled = true;
				Deployment.Current.Dispatcher.BeginInvoke(delegate { ReportErrorToDOM(e); });
			}
		}
		private void ReportErrorToDOM(ApplicationUnhandledExceptionEventArgs e)
		{
			try
			{
				string errorMsg = e.ExceptionObject.Message + e.ExceptionObject.StackTrace;
				errorMsg = errorMsg.Replace('"', '\'').Replace("\r\n", @"\n");

				System.Windows.Browser.HtmlPage.Window.Eval("throw new Error(\"Unhandled Error in Silverlight Application " + errorMsg + "\");");
			}
			catch (Exception)
			{
			}
		}
	}
}
