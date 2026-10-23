'use strict';

const { app, dialog, shell } = require('electron');
const path = require('path');

/**
 * Менеджер загрузок: отслеживает загрузки сессий и рассылает обновления в интерфейс.
 * Можно подключать несколько сессий (обычные окна + инкогнито).
 */
class DownloadManager {
  constructor({ getSettings, send, getWindow }) {
    this.getSettings = getSettings;
    this.send = send;
    this.getWindow = getWindow;
    this.entries = new Map();
    this.attached = new Set();
    this.counter = 0;
  }

  /** Подключает сессию к отслеживанию загрузок. */
  attach(session) {
    if (!session || this.attached.has(session)) return;
    this.attached.add(session);
    session.on('will-download', (event, item) => this._onDownload(item));
  }

  _onDownload(item) {
    const settings = this.getSettings();
    const dir = (settings.downloadPath || '').trim() || app.getPath('downloads');
    const id = `dl_${++this.counter}_${Date.now()}`;

    let savePath;
    if (settings.askWhereToSave) {
      const win = this.getWindow();
      savePath = dialog.showSaveDialogSync(win, {
        title: 'Сохранить файл',
        defaultPath: path.join(dir, item.getFilename()),
      });
      if (!savePath) {
        item.cancel();
        return;
      }
    } else {
      savePath = path.join(dir, item.getFilename());
    }
    item.setSavePath(savePath);

    const record = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath,
      mime: item.getMimeType(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      paused: false,
      canResume: item.canResume(),
      state: 'progressing',
      startedAt: Date.now(),
      endedAt: null,
    };

    this.entries.set(id, { record, item });
    this._emit();

    item.on('updated', (e, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes() || record.totalBytes;
      record.paused = item.isPaused();
      record.canResume = item.canResume();
      record.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      this._emit();
    });

    item.once('done', (e, state) => {
      record.state = state;
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes() || record.totalBytes;
      record.endedAt = Date.now();
      this._emit();
    });
  }

  list() {
    return [...this.entries.values()]
      .map((entry) => entry.record)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  action({ id, action }) {
    const entry = this.entries.get(id);
    if (!entry) return;
    const { record, item } = entry;
    switch (action) {
      case 'pause':
        if (item.isPaused()) item.resume();
        else item.pause();
        break;
      case 'cancel':
        item.cancel();
        break;
      case 'open':
        if (record.state === 'completed') shell.openPath(record.savePath);
        break;
      case 'show':
        shell.showItemInFolder(record.savePath);
        break;
      case 'remove':
        this.entries.delete(id);
        this._emit();
        break;
      default:
        break;
    }
  }

  clearFinished() {
    for (const [id, entry] of this.entries) {
      if (entry.record.state !== 'progressing') this.entries.delete(id);
    }
    this._emit();
  }

  _emit() {
    this.send('downloads:update', this.list());
  }
}

module.exports = DownloadManager;
