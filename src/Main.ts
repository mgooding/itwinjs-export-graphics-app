/*---------------------------------------------------------------------------------------------
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { ECSqlStatement, IModelHost, SnapshotDb } from "@itwin/core-backend";
import { DbResult, Id64Array, Logger, LogLevel } from "@itwin/core-bentley";

import * as fs from "fs";
import * as path from "path";
import * as yargs from "yargs";

const APP_LOGGER_CATEGORY = "itwinjs-export-graphics-app";

interface CliArgs {
  snapshotDirectory: string;
}

const cliArgs: yargs.Arguments<CliArgs> = yargs
  .usage("Usage: $0 --snapshotDirectory=<path>")
  .string("snapshotDirectory")
  .alias("snapshotDirectory", "s")
  .demandOption(["snapshotDirectory"])
  .argv;

(async () => {
  await IModelHost.startup();

  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Warning);
  Logger.setLevel(APP_LOGGER_CATEGORY, LogLevel.Info);

  const filesInDir = fs.readdirSync(cliArgs.snapshotDirectory);
  for (const candidateFile of filesInDir) {
    if (candidateFile.endsWith(".bim"))
      await exportSnapshot(path.join(cliArgs.snapshotDirectory, candidateFile));
  }

})().catch((reason) => {
  process.stdout.write(`${reason}\n`);
  process.exit(1);
});

async function exportSnapshot(snapshotFilePath: string) {
  const iModel: SnapshotDb = SnapshotDb.openFile(snapshotFilePath);
  Logger.logInfo(APP_LOGGER_CATEGORY, `Opened ${snapshotFilePath}`);

  const elementIdArray: Id64Array = [];
  // Get all 3D elements that aren't part of template definitions or in private models.
  const sql = "SELECT e.ECInstanceId FROM bis.GeometricElement3d e JOIN bis.Model m ON e.Model.Id=m.ECInstanceId WHERE m.isTemplate=false AND m.isPrivate=false";
  iModel.withPreparedStatement(sql, (stmt: ECSqlStatement) => {
    while (stmt.step() === DbResult.BE_SQLITE_ROW)
      elementIdArray.push(stmt.getValue(0).getId());
  });
  Logger.logInfo(APP_LOGGER_CATEGORY, `${snapshotFilePath} has ${elementIdArray.length} 3D elements`);
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
    await new Promise((resolve) => setImmediate(resolve)); // let garbage collection run
  }
  Logger.logInfo(APP_LOGGER_CATEGORY, `Exported in ${((new Date().getTime() - exportStartTime)/1000).toFixed(2)}s from ${snapshotFilePath}`);

  iModel.close();
}

