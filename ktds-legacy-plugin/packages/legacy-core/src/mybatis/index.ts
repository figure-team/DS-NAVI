/** MyBatis Mapper XML 추출(Tier B) — 단일 진입점. */
export { parseMapperXml, buildMyBatisModel, namespaceBaseName, isMapperXmlDocument } from './extract.js'
export {
  CrudSchema,
  MyBatisStatementSchema,
  MyBatisMapperSchema,
  MyBatisModelSchema,
} from './types.js'
export type { Crud, MyBatisStatement, MyBatisMapper, MyBatisModel } from './types.js'
