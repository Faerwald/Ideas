// Extensions → Apps Script in a Google Sheet, then run listFilesInFolder().
function listFilesInFolder() {
  var folderId = 'https://drive.google.com/drive/folders/1G-qob1N3DJzE57kUxCWRePwb_ApcNNbc?usp=sharing';
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var sheet = SpreadsheetApp.getActiveSheet();
  sheet.clear();
  sheet.appendRow(['Name','File ID','Preview URL','Download URL','Created','Modified']);
  while (files.hasNext()) {
    var f = files.next();
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var id = f.getId();
    sheet.appendRow([
      f.getName(), id,
      'https://drive.google.com/file/d/' + id + '/preview',
      'https://drive.google.com/uc?export=download&id=' + id,
      f.getDateCreated(), f.getLastUpdated()
    ]);
  }
}
