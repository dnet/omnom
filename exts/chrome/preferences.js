/**
 * Provide access to the preferences of the application.
 */
function Preferences () {

    /**
     * Save value of the boolean field in the localStorage.
     * 
     * @param booleanFieldId
     *            Id of the boolean field.
     */
    this.saveBoolean = function (booleanFieldId) {
        var booleanField = document.getElementById(booleanFieldId);
        console.log( [ booleanFieldId, booleanField.checked ]);
        localStorage[booleanFieldId] = (booleanField.checked || false);
    };

    /**
     * Save value of the text field in the local storage.
     * 
     * @param textFieldId
     *            Id of the textfield.
     */
    this.saveText = function (textFieldId) {
        var textField = document.getElementById(textFieldId);
        localStorage[textFieldId] = (textField.value || "");
    };

    /**
     * Load boolean field from the storage.
     * 
     * @param fieldId
     *            Id of the field.
     */
    this.loadBoolean = function (fieldId) {
        var fieldValue = localStorage[fieldId];
        // FIXME: buggy comparison but check for state always returns true.
        if ("true" === "" + fieldValue) {
            var fieldElement = document.getElementById(fieldId);
            fieldElement.checked = true;
        }
    };

    /**
     * Load text field from the storage.
     * 
     * @param fieldId
     *            Id of the field.
     * @param defaultValue
     *            Default value for the field.
     */
    this.loadText = function (fieldId, defaultValue) {
        var fieldValue = localStorage[fieldId];
        if (fieldValue === undefined && defaultValue != undefined) {
            fieldValue = defaultValue;
        }
        if (fieldValue) {
            var fieldElement = document.getElementById(fieldId);
            fieldElement.value = fieldValue;
        }
    };

    /**
     * Restores select box state to saved value from localStorage.
     */
    // TODO: Implement automatic detection of saveable fields.
    this.restoreAll = function () {
        this.loadBoolean("markPrivate");
        this.loadBoolean("syncWithChromeBookmarks");
        this.loadText("userName");
        this.loadText("server");
        this.loadText("shortcut", "ctrl+m");
    };

    /**
     * Saves options to localStorage.
     */
    // TODO: Implement automatic detection of saveable fields.
    this.saveAll = function () {
        this.saveBoolean("markPrivate");
        this.saveBoolean("syncWithChromeBookmarks");
        this.saveText("userName");
        this.saveText("server");
        this.saveText("shortcut");

        // Update status to let user know options were saved.
        var status = document.getElementById("status");
        status.innerHTML = "Options were successfully saved.";
        window.setTimeout(function () {
            status.innerHTML = "";
        }, 3000);
    };

}
