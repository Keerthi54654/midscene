/* eslint-disable @typescript-eslint/ban-types */
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import assert from 'assert';
import {
  UISection,
  UIContext,
  Rect,
  InsightDump,
  LiteUISection,
  PartialInsightDumpFromSDK,
  BaseElement,
  ElementById,
  DumpSubscriber,
  DumpMeta,
} from '@/types';
import { getDumpDir, getPkgInfo, insightDumpFileExt, writeDumpFile } from '@/utils';

let logFileName = '';
const logContent: string[] = [];
const logIdIndexMap: Record<string, number> = {};
const { pid } = process;
const logFileExt = insightDumpFileExt;

export function writeInsightDump(
  data: PartialInsightDumpFromSDK,
  logId?: string,
  dumpSubscriber?: DumpSubscriber,
): string {
  const logDir = getDumpDir();
  assert(logDir, 'logDir should be set before writing dump file');

  const id = logId || randomUUID();
  const baseData: DumpMeta = {
    sdkVersion: getPkgInfo().version,
    logTime: Date.now(),
  };
  const finalData: InsightDump = {
    logId: id,
    ...baseData,
    ...data,
  };

  dumpSubscriber?.(finalData);

  if (!logFileName) {
    logFileName = `pid_${pid}_${baseData.logTime}`;
    while (existsSync(join(logDir, `${logFileName}.${logFileExt}`))) {
      logFileName = `${pid}_${baseData.logTime}-${Math.random()}`;
    }
  }
  const dataString = JSON.stringify(finalData, null, 2);

  if (typeof logIdIndexMap[id] === 'number') {
    logContent[logIdIndexMap[id]] = dataString;
  } else {
    const length = logContent.push(dataString);
    logIdIndexMap[id] = length - 1;
  }
  writeDumpFile({
    fileName: logFileName,
    fileExt: logFileExt,
    fileContent: `[\n${logContent.join(',\n')}\n]`,
  });

  return id;
}

export function idsIntoElements(ids: string[], elementById: ElementById): BaseElement[] {
  return ids.reduce<BaseElement[]>((acc, id) => {
    const element = elementById(id);
    if (element) {
      acc.push(element);
    } else {
      console.warn(`element not found by id: ${id}`);
    }
    return acc;
  }, []);
}

export function shallowExpandIds<DataScheme extends object = {}>(
  data: DataScheme,
  ifMeet: (id: string) => boolean,
  elementsById: (id: string) => BaseElement | BaseElement[] | null,

  // return same type as data
): DataScheme {
  const keys = Object.keys(data);
  keys.forEach((key) => {
    const value = (data as any)[key];
    if (typeof value === 'string' && ifMeet(value)) {
      // (data as any)[key] = elementsById(value);
      (data as any)[key] = elementsById(value);
    } else if (Array.isArray(value)) {
      const newValue = value.map((id) => (ifMeet(id) ? elementsById(id) : id));
      (data as any)[key] = newValue;
    }
  });

  return data;
}

export function expandLiteSection(liteSection: LiteUISection, elementById: ElementById): UISection {
  const { textIds, ...remainingFields } = liteSection;

  const texts: BaseElement[] = idsIntoElements(textIds, elementById);

  let leftMost = -1;
  let topMost = -1;
  let rightMost = -1;
  let bottomMost = -1;
  texts.forEach((text) => {
    leftMost = leftMost === -1 ? text.rect.left : Math.min(leftMost, text.rect.left);
    topMost = topMost === -1 ? text.rect.top : Math.min(topMost, text.rect.top);
    rightMost = Math.max(rightMost, text.rect.left + text.rect.width);
    bottomMost = Math.max(bottomMost, text.rect.top + text.rect.height);
  });
  const sectionRect: Rect = {
    left: leftMost,
    top: topMost,
    width: rightMost - leftMost,
    height: bottomMost - topMost,
  };

  const section: UISection = {
    ...remainingFields,
    content: texts,
    rect: sectionRect,
  };

  return section;
}

/**
 * a fake parser that collects all text into a single section
 * It's useful for debugging and testing
 * @param context
 * @returns
 */
export async function fakeParserCollectsTexts<P>(context: UIContext): Promise<{
  [K in keyof P]: UISection;
}> {
  const { content } = context;
  const section: UISection = {
    name: 'all-texts',
    description: 'all texts in the page',
    sectionCharacteristics: 'all texts',
    content,
    rect: {
      left: 0,
      top: 0,
      width: context.size.width,
      height: context.size.height,
    },
  };
  return {
    'all-texts': section,
  } as any;
}
