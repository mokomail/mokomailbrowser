'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function getExtensionsDir() {
  return path.join(app.getPath('userData'), 'extensions');
}

function ensureDir() {
  const dir = getExtensionsDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function readJson(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function list() {
  const dir = ensureDir();
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { entries = []; }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const base = path.join(dir, ent.name);
    const manifestPath = path.join(base, 'manifest.json');
    const manifest = readJson(manifestPath);
    if (!manifest) continue;
    const enabled = readJson(path.join(base, 'enabled.json'));
    out.push({
      id: ent.name,
      name: manifest.name || ent.name,
      version: manifest.version || '',
      description: manifest.description || '',
      manifest,
      enabled: enabled ? enabled.enabled !== false : true,
      path: base,
    });
  }
  return out;
}

function setEnabled(id, enabled) {
  if (!isValidId(id)) return false;
  const dir = ensureDir();
  const base = path.resolve(dir, id);
  const resolvedDir = path.resolve(dir);
  if (base !== resolvedDir && !base.startsWith(resolvedDir + path.sep)) return false;
  try {
    fs.writeFileSync(path.join(base, 'enabled.json'), JSON.stringify({ enabled: !!enabled }, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function isValidId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9._-]+$/.test(id);
}

function remove(id) {
  if (!isValidId(id)) return false;
  const dir = ensureDir();
  const base = path.resolve(dir, id);
  const resolvedDir = path.resolve(dir);
  if (base !== resolvedDir && !base.startsWith(resolvedDir + path.sep)) return false;
  try {
    const rimraf = (p) => {
      if (!fs.existsSync(p)) return;
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const f of fs.readdirSync(p)) rimraf(path.join(p, f));
        fs.rmdirSync(p);
      } else {
        fs.unlinkSync(p);
      }
    };
    rimraf(base);
    return true;
  } catch {
    return false;
  }
}

function getScriptsForUrl(url) {
  if (typeof url !== 'string') return [];
  if (!/^https?:\/\//i.test(url)) return [];
  const exts = list();
  const result = [];
  const baseDir = path.resolve(ensureDir());
  for (const ext of exts) {
    if (!ext.enabled) continue;
    const m = ext.manifest || {};
    const cs = Array.isArray(m.content_scripts) ? m.content_scripts : [];
    for (const s of cs) {
      const matches = Array.isArray(s.matches) ? s.matches : [];
      let ok = false;
      for (const pat of matches) {
        if (matchPattern(url, pat)) { ok = true; break; }
      }
      if (!ok) continue;
      const js = Array.isArray(s.js) ? s.js : [];
      const css = Array.isArray(s.css) ? s.css : [];
      for (const j of js) {
        const p = path.resolve(ext.path, String(j));
        if (!p.startsWith(baseDir + path.sep) && p.indexOf(baseDir) !== 0) continue;
        try {
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const code = fs.readFileSync(p, 'utf8');
            if (typeof code === 'string') result.push({ type: 'js', code });
          }
        } catch {}
      }
      for (const c of css) {
        const p = path.resolve(ext.path, String(c));
        if (!p.startsWith(baseDir + path.sep) && p.indexOf(baseDir) !== 0) continue;
        try {
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const code = fs.readFileSync(p, 'utf8');
            if (typeof code === 'string') result.push({ type: 'css', code });
          }
        } catch {}
      }
    }
  }
  return result;
}

function matchPattern(url, pattern) {
  if (!pattern) return false;
  if (pattern === '<all_urls>') return /^https?:\/\//i.test(url);
  try {
    if (String(pattern).indexOf('://') === -1) return false;
    // very simple: * and scheme://host/*
    let p = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    p = p.replace(/\*/g, '.*');
    const re = new RegExp('^' + p + '$', 'i');
    return re.test(url);
  } catch {
    return false;
  }
}

function getDir() {
  return ensureDir();
}

module.exports = { list, setEnabled, remove, getScriptsForUrl, getDir };
