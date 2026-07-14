(function (global) {
  "use strict";

  var DATABASE_NAME = "fixtxt";
  var DATABASE_VERSION = 1;
  var TAB_STORE = "tab-texts";
  var databasePromise = null;

  function openDatabase() {
    if (databasePromise) {
      return databasePromise;
    }

    databasePromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      var request = global.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(TAB_STORE)) {
          database.createObjectStore(TAB_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = function () {
        var database = request.result;
        database.onversionchange = function () {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };

      request.onerror = function () {
        databasePromise = null;
        reject(request.error || new Error("Could not open IndexedDB."));
      };

      request.onblocked = function () {
        databasePromise = null;
        reject(new Error("IndexedDB upgrade was blocked."));
      };
    });

    return databasePromise;
  }

  function runTransaction(mode, operation) {
    return openDatabase().then(function (database) {
      return new Promise(function (resolve, reject) {
        var transaction = database.transaction(TAB_STORE, mode);
        var store = transaction.objectStore(TAB_STORE);
        var result;

        try {
          result = operation(store);
        } catch (error) {
          transaction.abort();
          reject(error);
          return;
        }

        transaction.oncomplete = function () {
          resolve(
            result && result.result !== undefined ? result.result : result,
          );
        };
        transaction.onerror = function () {
          reject(
            transaction.error || new Error("IndexedDB transaction failed."),
          );
        };
        transaction.onabort = function () {
          reject(
            transaction.error ||
              new Error("IndexedDB transaction was aborted."),
          );
        };
      });
    });
  }

  function readTabs() {
    return openDatabase().then(function (database) {
      return new Promise(function (resolve, reject) {
        var transaction = database.transaction(TAB_STORE, "readonly");
        var request = transaction.objectStore(TAB_STORE).getAll();

        request.onsuccess = function () {
          resolve(Array.isArray(request.result) ? request.result : []);
        };
        request.onerror = function () {
          reject(request.error || new Error("Could not read saved tabs."));
        };
      });
    });
  }

  function writeTabs(records) {
    if (!records.length) {
      return Promise.resolve();
    }

    return runTransaction("readwrite", function (store) {
      records.forEach(function (record) {
        store.put(record);
      });
    });
  }

  function deleteTabs(ids) {
    if (!ids.length) {
      return Promise.resolve();
    }

    return runTransaction("readwrite", function (store) {
      ids.forEach(function (id) {
        store.delete(id);
      });
    });
  }

  function clearTabs() {
    return runTransaction("readwrite", function (store) {
      store.clear();
    });
  }

  global.FixTxtStorage = {
    clearTabs: clearTabs,
    deleteTabs: deleteTabs,
    readTabs: readTabs,
    writeTabs: writeTabs,
  };
})(window);
