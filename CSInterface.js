/**************************************************************************************************
 * CSInterface — minimal CEP bridge for Adobe host apps (After Effects, Premiere, etc.)
 *
 * This is a trimmed, dependency-free build of Adobe's CSInterface library covering the API the
 * SRT Editor panel actually uses (evalScript) plus a handful of commonly needed helpers. It talks
 * to the host through window.__adobe_cep__, which only exists when the page is loaded inside a CEP
 * host — so on a plain web page these calls simply no-op and `new CSInterface()` yields a harmless
 * object. (The panel additionally gates AE-only UI behind `window.__adobe_cep__`.)
 **************************************************************************************************/

/* eslint-disable */

function SystemPath() {}
SystemPath.USER_DATA        = 'userData';
SystemPath.COMMON_FILES     = 'commonFiles';
SystemPath.MY_DOCUMENTS     = 'myDocuments';
SystemPath.APPLICATION      = 'application';
SystemPath.EXTENSION        = 'extension';
SystemPath.HOST_APPLICATION = 'hostApplication';

function CSEvent(type, scope, appId, extensionId) {
  this.type        = type;
  this.scope       = scope;
  this.appId       = appId;
  this.extensionId = extensionId;
  this.data        = '';
}

function CSInterface() {
  this.hostEnvironment = this.getHostEnvironment();
}

/** Returns the parsed host environment, or null when not inside a CEP host. */
CSInterface.prototype.getHostEnvironment = function () {
  if (!window.__adobe_cep__) return null;
  try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()); }
  catch (e) { return null; }
};

/** Evaluate an ExtendScript string in the host. callback(result) receives the return value. */
CSInterface.prototype.evalScript = function (script, callback) {
  if (callback === null || callback === undefined) { callback = function (result) {}; }
  if (!window.__adobe_cep__) { callback('EvalScript error: not running inside a CEP host.'); return; }
  window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getApplicationID = function () {
  return this.hostEnvironment ? this.hostEnvironment.appId : '';
};

CSInterface.prototype.getOSInformation = function () {
  var p = navigator.platform;
  if (p === 'Win32' || p === 'Windows' || /Win/.test(p)) return 'Windows';
  if (p === 'MacIntel' || p === 'Macintosh' || /Mac/.test(p)) return 'Mac';
  return 'Unknown';
};

/** Resolve a host/system path (e.g. SystemPath.EXTENSION) to an absolute path. */
CSInterface.prototype.getSystemPath = function (pathType) {
  if (!window.__adobe_cep__) return '';
  var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
  if (this.getOSInformation() === 'Windows') path = path.replace('file:///', '');
  else                                       path = path.replace('file://', '');
  return path;
};

CSInterface.prototype.addEventListener = function (type, listener, obj) {
  if (window.__adobe_cep__) window.__adobe_cep__.addEventListener(type, listener, obj);
};
CSInterface.prototype.removeEventListener = function (type, listener, obj) {
  if (window.__adobe_cep__) window.__adobe_cep__.removeEventListener(type, listener, obj);
};
CSInterface.prototype.dispatchEvent = function (event) {
  if (typeof event.data === 'object') event.data = JSON.stringify(event.data);
  if (window.__adobe_cep__) window.__adobe_cep__.dispatchEvent(event);
};

CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
  if (window.__adobe_cep__) window.__adobe_cep__.requestOpenExtension(extensionId, params);
};
CSInterface.prototype.closeExtension = function () {
  if (window.__adobe_cep__) window.__adobe_cep__.closeExtension();
};
CSInterface.prototype.getExtensionID = function () {
  return window.__adobe_cep__ ? window.__adobe_cep__.getExtensionId() : '';
};
CSInterface.prototype.getScaleFactor = function () {
  return window.__adobe_cep__ ? window.__adobe_cep__.getScaleFactor() : 1;
};
CSInterface.prototype.setWindowTitle = function (title) {
  if (window.__adobe_cep__) window.__adobe_cep__.invokeSyncCommand
    ? window.__adobe_cep__.invokeSyncCommand(0, title) : null;
};
