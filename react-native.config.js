module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath:
          'import com.inforahul.backgroundlocation.BackgroundLocationPackage;',
        packageInstance: 'new BackgroundLocationPackage()',
      },
      // Podspec is auto-discovered from the package root.
      ios: {},
    },
  },
};
