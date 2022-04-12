/*---------------------------------------------------------------------------------------------
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { ECSqlStatement, IModelHost, SnapshotDb } from "@itwin/core-backend";
import { DbResult, Id64Array, Logger, LogLevel } from "@itwin/core-bentley";

const APP_LOGGER_CATEGORY = "itwinjs-export-graphics-app";

const SNAPSHOT_PATH = "";

(async () => {
  await IModelHost.startup();

  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel(APP_LOGGER_CATEGORY, LogLevel.Info);

  const iModel: SnapshotDb = SnapshotDb.openFile(SNAPSHOT_PATH);
  Logger.logInfo(APP_LOGGER_CATEGORY, `Opened ${SNAPSHOT_PATH}`);

  const elementIdArray: Id64Array = [];
  // Get all 3D elements that aren't part of template definitions or in private models.
  const sql = "SELECT e.ECInstanceId FROM bis.GeometricElement3d e JOIN bis.Model m ON e.Model.Id=m.ECInstanceId WHERE m.isTemplate=false AND m.isPrivate=false";
  iModel.withPreparedStatement(sql, (stmt: ECSqlStatement) => {
    while (stmt.step() === DbResult.BE_SQLITE_ROW)
      elementIdArray.push(stmt.getValue(0).getId());
  });
  Logger.logInfo(APP_LOGGER_CATEGORY, `Found ${elementIdArray.length} 3D elements`);
  if (elementIdArray.length === 0)
    return;

  const exportStartTime = new Date().getTime();

  const exportChunkSize = 50;
  for (let i = 0; i < elementIdArray.length; i += exportChunkSize) {
    iModel.exportGraphics({
      elementIdArray: elementIdArray.slice(i, i + exportChunkSize),
      onGraphics: () => { }, // just exercising mesh generation
      onLineGraphics: () => { }, // just exercising line generation
      chordTol: 0.05, // fine enough to do some work, but not run slowly
      decimationTol: 0.05, // exercise decimation code
    });
  }
  Logger.logInfo(APP_LOGGER_CATEGORY, `Exported in ${((new Date().getTime() - exportStartTime)/1000).toFixed(2)}s`);

})().catch((reason) => {
  process.stdout.write(`${reason}\n`);
  process.exit(1);
});

