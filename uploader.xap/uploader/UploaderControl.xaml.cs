﻿using System;
using System.Linq;
using System.Net;
using System.Net.Browser;
using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Browser;
using System.Threading;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Media.Effects;
using System.Windows.Controls;
using System.Windows.Threading;

namespace uploader
{
	public partial class FileUploadControl : UserControl
	{
		private ObservableCollection<FileUpload> files;
		private DispatcherTimer notifyTimer;
		private int notifyJsTick;

		public string BrowseText { get; set; }
		public string ButtonURL { get; set; }
		public string HtmlUploaderID { get; set; }
		public string HtmlFrontentID { get; set; }
		public string HtmlProxyName { get; set; }
		public string FileFilter { get; set; }

		public FileUploadControl()
		{
			files = new ObservableCollection<FileUpload>();
			InitializeComponent();
			Loaded += new RoutedEventHandler(Page_Loaded);
			notifyTimer = new DispatcherTimer();
			/*
			 We could use the following line to switch to ClientHttp http stack.
			 In this case we will have one advantage: correct response code from server (to distinguish 201 and 200 code).
			 But, we will have big disadvantages:
				1. Lack of proxy authorization
				2. Necessity to add cookies to request manually
			*/
			//bool httpResult = WebRequest.RegisterPrefix("http://", WebRequestCreator.ClientHttp);
		}
		public void StartNotifyJS()
		{
			notifyJsTick = Constants.JsNotifyTryies;
			notifyTimer.Interval = new TimeSpan(0, 0, 0, 0, Constants.JsNotifyInterval);
			notifyTimer.Tick += new EventHandler(NotifyJS);
			notifyTimer.Start();
		}
		public void NotifyJS(object o, EventArgs sender)
		{
			bool wasError = false;
			notifyJsTick--;
			wasError = callJS("onFEReady", "silverlight", Environment.Version);
			if (wasError == false || notifyJsTick <= 0)
			{
				notifyTimer.Stop();
			}
		}
		bool callJS(params Object[] args)
		{
			Object[] a = new Object[args.Length + 2];
			a.SetValue(HtmlUploaderID, 0);
			a.SetValue(HtmlFrontentID, 1);
			Array.Copy(args, 0, a, 2, args.Length);
			bool wasError = false;
			try
			{
				ScriptObject lu = (ScriptObject)HtmlPage.Window.GetProperty(HtmlProxyName);
				lu.Invoke("callFEMethod", a);
			}
			catch (Exception)
			{
				wasError = true;
			}
			return wasError;
		}
		void SetClassicButton(object sender, RoutedEventArgs e)
		{
			((Button)LayoutRoot.FindName("BrowseButton")).Content = BrowseText;
			((Button)LayoutRoot.FindName("BrowseButton")).Visibility = Visibility.Visible;
			((Image)LayoutRoot.FindName("BrowseImage")).Visibility = Visibility.Collapsed;
		}
		void SetImageButton()
		{
			BitmapImage im = new BitmapImage(new Uri(ButtonURL, UriKind.Absolute));
			im.ImageFailed += new EventHandler<ExceptionRoutedEventArgs>(SetClassicButton);
			((Image)LayoutRoot.FindName("BrowseImage")).Source = im;
			((Image)LayoutRoot.FindName("BrowseImage")).Visibility = Visibility.Visible;
			((Button)LayoutRoot.FindName("BrowseButton")).Visibility = Visibility.Collapsed;
		}
		void Page_Loaded(object sender, RoutedEventArgs e)
		{
			HtmlPage.RegisterScriptableObject("API", this);
			StartNotifyJS();
			if (ButtonURL.Length > 0)
			{
				SetImageButton();
			}
			else
			{
				SetClassicButton(null, null);
			}
		}
		void addFilesButton_Click(object sender, RoutedEventArgs e)
		{
			OpenFileDialog dlg = new OpenFileDialog();
			dlg.Filter = FileFilter;
			dlg.Multiselect = true;

			if ((bool)dlg.ShowDialog())
			{
				int index = 0;
				foreach (FileInfo file in dlg.Files)
				{
					++index;
					FileUpload upload = new FileUpload(this.Dispatcher, file);

					upload.StatusChanged += new EventHandler(upload_StatusChanged);
					upload.UploadProgressChanged += new ProgressChangedEvent(upload_UploadProgressChanged);
					//debug
					upload.PropertyChanged += new System.ComponentModel.PropertyChangedEventHandler(upload_Debug);
					callJS("onSelect", upload.SessionId, upload.Name, upload.FileLength, index, dlg.Files.Count());
					files.Add(upload);
				}
			}
		}

		void upload_Debug(object sender, System.ComponentModel.PropertyChangedEventArgs e)
		{
			FileUpload fu = sender as FileUpload;
			callJS("alert", "Debug: " + fu.DebugText);
		}

		void upload_UploadProgressChanged(object sender, UploadProgressChangedEventArgs args)
		{
			FileUpload fu = sender as FileUpload;
			callJS("onProgress", fu.SessionId, args.TotalBytesUploaded, args.TotalBytes);
		}

		void upload_StatusChanged(object sender, EventArgs e)
		{
			FileUpload fu = sender as FileUpload;
			if (fu.Status == FileUploadStatus.Complete)
			{
				callJS("onDone", fu.SessionId, fu.ResponseText, fu.FileLength);
			}
			else if (fu.Status == FileUploadStatus.Failed)
			{
				callJS("onError", fu.SessionId, fu.ErrorCode, fu.ErrorDescr);
			}
			else if (fu.Status == FileUploadStatus.Retry)
			{
				fu.RetryUpload();
			}
			else if (fu.Status == FileUploadStatus.Continue)
			{
				fu.UploadFileEx();
			}
			else if (fu.Status == FileUploadStatus.Canceled)
			{
				files.Remove(fu);
			}
		}

		[ScriptableMember]
		public void startUpload(string id, string url, string additionalData)
		{
			FileUpload fu = files.First(f => f.SessionId == id);
			try
			{
				if (fu.UploadUrl == null || fu.UploadUrl.ToString().Length == 0) // it can be set from IsoStorage
				{
					if (additionalData.Length != 0)
					{
						fu.UploadUrl = new Uri(url + "?" + additionalData, UriKind.RelativeOrAbsolute);
					}
					else
					{
						fu.UploadUrl = new Uri(url, UriKind.RelativeOrAbsolute);
					}
				}
			}
			catch (Exception) { }
			fu.StartUpload();
		}

		[ScriptableMember]
		public void cancelUpload(string id)
		{
			FileUpload fu = files.First(f => f.SessionId == id);
			fu.CancelUpload();
		}

		[ScriptableMember]
		public void setEnabled(bool state)
		{
			((Button)LayoutRoot.FindName("BrowseButton")).IsEnabled = state;
			if (state)
			{
				((Image)LayoutRoot.FindName("BrowseImage")).Opacity = 1;
				LayoutRoot.IsHitTestVisible = true;
			}
			else
			{
				((Image)LayoutRoot.FindName("BrowseImage")).Opacity = 0.5;
				LayoutRoot.IsHitTestVisible = false;
			}
		}
	}
}
