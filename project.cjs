const path = require('node:path');
const os = require('node:os');

const PRODUCT_NAME = 'pet-with-you';
const MAINTAINER = 'MasLCH957';
const REPOSITORY_URL = 'https://github.com/MasLCH957/pet-with-you-lyrics';
const MAINTAINER_URL = 'https://github.com/MasLCH957';
const UPSTREAM_URL = 'https://github.com/Refining-colors/pet-with-you';
const DATA_DIRECTORY_NAME = 'pet-with-you';
const LEGACY_DATA_DIRECTORY_NAME = 'DSH Pet Companion';
function dataDirectory(appData = process.env.APPDATA || os.homedir()) {
  return process.env.PET_TEST_DATA_DIR || process.env.PET_DEV_DATA_DIR || path.join(appData, DATA_DIRECTORY_NAME);
}
module.exports = { PRODUCT_NAME, MAINTAINER, REPOSITORY_URL, MAINTAINER_URL, UPSTREAM_URL, DATA_DIRECTORY_NAME, LEGACY_DATA_DIRECTORY_NAME, dataDirectory };
