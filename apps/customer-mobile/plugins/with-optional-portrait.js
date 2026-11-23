// Keeps the Android manifest saying that a portrait screen is optional, even after the native project is regenerated (npx expo prebuild).
//
// The app is locked to portrait, and Android reads a portrait-only activity as "this app requires a portrait-capable screen". Google Play then
// restricts availability to devices that declare that feature and warns about it in the console. Declaring the feature as not required removes
// the restriction. The same line is in android/app/src/main/AndroidManifest.xml; this plugin makes sure a regenerated project gets it too.
const { withAndroidManifest } = require('@expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

/** Adds <uses-feature android:name="android.hardware.screen.portrait" android:required="false"/> to a parsed manifest, once. */
function addOptionalPortrait(manifest) {
  const root = manifest.manifest;
  root['uses-feature'] = root['uses-feature'] || [];
  const existing = root['uses-feature'].find(item => item.$ && item.$['android:name'] === FEATURE);
  if (existing) existing.$['android:required'] = 'false';
  else root['uses-feature'].push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
  return manifest;
}

module.exports = config => withAndroidManifest(config, mod => {
  mod.modResults = addOptionalPortrait(mod.modResults);
  return mod;
});
module.exports.addOptionalPortrait = addOptionalPortrait;
