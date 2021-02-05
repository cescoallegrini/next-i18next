import { defaultConfig } from './default-config';
import { consoleMessage, isServer, isCIMode } from '../utils';
const deepMergeObjects = ['backend', 'detection'];

const dedupe = names => names.filter((v, i) => names.indexOf(v) === i);

const STATIC_LOCALE_PATH = 'static/locales';
export const createConfig = userConfig => {
  if (typeof userConfig.localeSubpaths === 'string') {
    throw new Error('The localeSubpaths option has been changed to an object. Please refer to documentation.');
  }
  /*
    Initial merge of default and user-provided config
  */


  const combinedConfig = { ...defaultConfig,
    ...userConfig
  };
  /*
    Sensible defaults to prevent user duplication
  */

  combinedConfig.allLanguages = dedupe(combinedConfig.otherLanguages.concat([combinedConfig.defaultLanguage])); // https://github.com/i18next/i18next/blob/master/CHANGELOG.md#1950

  combinedConfig.supportedLngs = combinedConfig.allLanguages; // temporal backwards compatibility WHITELIST REMOVAL

  combinedConfig.whitelist = combinedConfig.allLanguages; // end temporal backwards compatibility WHITELIST REMOVAL

  const {
    allLanguages,
    defaultLanguage,
    defaultNS,
    localeExtension,
    localePath,
    localeStructure
  } = combinedConfig;
  /** 
   * Skips translation file resolution while in cimode
   * https://github.com/isaachinman/next-i18next/pull/851#discussion_r503113620
  */

  if (isCIMode(defaultLanguage)) {
    return combinedConfig;
  }

  if (isServer()) {
    /*
      On Server side preload (languages)
    */
    combinedConfig.preload = allLanguages;
    const hasCustomBackend = userConfig.use && userConfig.use.find(b => b.type === 'backend');

    if (!hasCustomBackend) {
      const fs = eval("require('fs')");

      const path = require('path');

      let serverLocalePath = localePath;
      /*
        Validate defaultNS
        https://github.com/isaachinman/next-i18next/issues/358
      */

      if (typeof defaultNS === 'string') {
        const defaultStructure = localeStructure.replace(/{{ns}}/g, defaultNS).replace(/{{lng}}/g, defaultLanguage);
        const defaultFile = `/${defaultStructure}.${localeExtension}`;
        const defaultNSPath = path.join(localePath, defaultFile);
        const defaultNSExists = fs.existsSync(defaultNSPath);

        if (!defaultNSExists) {
          /*
            If defaultNS doesn't exist, try to fall back to the deprecated static folder
            https://github.com/isaachinman/next-i18next/issues/523
          */
          const staticDirPath = path.resolve(process.cwd(), STATIC_LOCALE_PATH, defaultFile);
          const staticDirExists = fs.existsSync(staticDirPath);

          if (staticDirExists) {
            consoleMessage('warn', 'next-i18next: Falling back to /static folder, deprecated in next@9.1.*', combinedConfig);
            serverLocalePath = STATIC_LOCALE_PATH;
          } else if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Default namespace not found at ${defaultNSPath}`);
          }
        }
      }
      /*
        Set server side backend
      */


      combinedConfig.backend = {
        loadPath: path.resolve(process.cwd(), `${serverLocalePath}/${localeStructure}.${localeExtension}`),
        addPath: path.resolve(process.cwd(), `${serverLocalePath}/${localeStructure}.missing.${localeExtension}`)
      };
      /*
        Set server side preload (namespaces)
      */

      if (!combinedConfig.ns) {
        const getAllNamespaces = p => fs.readdirSync(p).map(file => file.replace(`.${localeExtension}`, ''));

        combinedConfig.ns = getAllNamespaces(path.resolve(process.cwd(), `${serverLocalePath}/${defaultLanguage}`));
      }
    }
  } else {
    let clientLocalePath = localePath;
    /*
      Remove public prefix from client site config
    */

    if (localePath.startsWith('/public/')) {
      clientLocalePath = localePath.replace(/^\/public/, '');
    }
    /*
      Set client side backend
    */


    combinedConfig.backend = {
      loadPath: `${clientLocalePath}/${localeStructure}.${localeExtension}`,
      addPath: `${clientLocalePath}/${localeStructure}.missing.${localeExtension}`
    };
    combinedConfig.ns = [defaultNS];
  }
  /*
    Set fallback language to defaultLanguage in production
  */


  if (typeof userConfig.fallbackLng !== 'boolean' && !userConfig.fallbackLng) {
    combinedConfig.fallbackLng = process.env.NODE_ENV === 'production' ? combinedConfig.defaultLanguage : false;
  }
  /*
    Deep merge with overwrite - goes last
  */


  deepMergeObjects.forEach(obj => {
    if (userConfig[obj]) {
      combinedConfig[obj] = { ...defaultConfig[obj],
        ...userConfig[obj]
      };
    }
  });
  return combinedConfig;
};