/**
 * 블록 수정 페이지 라우터
 * - /blocks: 블록 수정 페이지 서빙
 * - /api/blocks: 블록 관련 API
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import { validatePageToken } from '../services/token/pageToken';
import { getConnection } from '../services/database/connection';
import sql from 'mssql';
import { logger } from '../utils/logger';

const router = Router();

/**
 * 블록 수정 페이지 서빙
 * GET /blocks?uuid=xxx&token=xxx
 */
router.get('/blocks', async (req: Request, res: Response) => {
  const { uuid, token } = req.query;

  if (!uuid || !token) {
    return res.status(400).send('잘못된 접근입니다.');
  }

  // 토큰 검증
  const tokenData = await validatePageToken(uuid as string, token as string);
  if (!tokenData) {
    return res.status(401).send('유효하지 않거나 만료된 링크입니다.');
  }

  // 페이지 서빙
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * 정적 파일 서빙 (CSS, JS)
 */
router.use('/css', (req, res, next) => {
  const filePath = path.join(__dirname, '../public/css', req.path);
  res.sendFile(filePath, err => {
    if (err) next();
  });
});

router.use('/js', (req, res, next) => {
  const filePath = path.join(__dirname, '../public/js', req.path);
  res.sendFile(filePath, err => {
    if (err) next();
  });
});

/**
 * 블록 목록 조회 API
 * GET /api/blocks?uuid=xxx&token=xxx
 */
router.get('/api/blocks', async (req: Request, res: Response) => {
  try {
    const { uuid, token } = req.query;

    // 토큰 검증
    const tokenData = await validatePageToken(uuid as string, token as string);
    if (!tokenData) {
      return res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
    }

    const { hos_cd, hos_cso_cd } = tokenData;
    const pool = await getConnection();

    // 병원 정보 조회
    const hospitalResult = await pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`
        SELECT hos_name, hos_abbr
        FROM HOSPITAL_TBL
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
      `);

    const hospital = hospitalResult.recordset[0];
    const hospitalName = hospital?.hos_abbr || hospital?.hos_name || '병원명';

    // 블록 목록 조회 (진료과별 기간 포함)
    const blocksResult = await pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`
        SELECT
          b.hos_cd, b.hos_cso_cd, b.drug_cd, d.drug_name,
          b.seq, b.cso_cd, c.cso_dealer_nm, c.cso_corp_nm,
          b.disease_type, b.start_year, b.start_month, b.end_year, b.end_month
        FROM BLOCK_TBL b
        LEFT JOIN DRUG_TBL d ON b.drug_cd = d.drug_cd
        LEFT JOIN CSO_TBL c ON b.cso_cd = c.cso_cd
        WHERE b.hos_cd = @hos_cd AND b.hos_cso_cd = @hos_cso_cd
        ORDER BY d.drug_name, b.seq, b.disease_type
      `);

    // 그룹화: drug_cd + seq 기준으로 묶고, diseases 배열로 정리
    const blockMap = new Map<string, any>();
    for (const row of blocksResult.recordset) {
      const key = `${row.drug_cd}|${row.seq}`;
      if (!blockMap.has(key)) {
        blockMap.set(key, {
          hos_cd: row.hos_cd,
          hos_cso_cd: row.hos_cso_cd,
          drug_cd: row.drug_cd,
          drug_name: row.drug_name,
          seq: row.seq,
          cso_cd: row.cso_cd,
          cso_dealer_nm: row.cso_dealer_nm,
          cso_corp_nm: row.cso_corp_nm,
          diseases: [],
        });
      }
      if (row.disease_type) {
        blockMap.get(key).diseases.push({
          name: row.disease_type,
          start_year: row.start_year,
          start_month: row.start_month,
          end_year: row.end_year,
          end_month: row.end_month,
        });
      }
    }

    res.json({
      hospitalName,
      hosCd: hos_cd,
      hosCsoCd: hos_cso_cd,
      data: Array.from(blockMap.values()),
    });
  } catch (error) {
    logger.error('블록 조회 실패:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 블록 추가 API
 * POST /api/blocks
 */
router.post('/api/blocks', async (req: Request, res: Response) => {
  try {
    const { uuid, token } = req.query;

    // 토큰 검증
    const tokenData = await validatePageToken(uuid as string, token as string);
    if (!tokenData) {
      return res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
    }

    const { drug_cd, cso_cd, disease_type, start_year, start_month, end_year, end_month } = req.body;
    const { hos_cd, hos_cso_cd } = tokenData;

    const pool = await getConnection();

    // 새 seq 계산
    const seqResult = await pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('drug_cd', sql.NVarChar, drug_cd)
      .query(`
        SELECT ISNULL(MAX(CAST(seq AS INT)), 0) + 1 AS new_seq
        FROM BLOCK_TBL
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd
      `);

    const newSeq = seqResult.recordset[0].new_seq.toString();

    // 블록 추가
    await pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('seq', sql.NVarChar, newSeq)
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('disease_type', sql.NVarChar, disease_type || null)
      .input('start_year', sql.Int, start_year)
      .input('start_month', sql.Int, start_month)
      .input('end_year', sql.Int, end_year)
      .input('end_month', sql.Int, end_month)
      .query(`
        INSERT INTO BLOCK_TBL (hos_cd, hos_cso_cd, drug_cd, seq, cso_cd, disease_type, start_year, start_month, end_year, end_month)
        VALUES (@hos_cd, @hos_cso_cd, @drug_cd, @seq, @cso_cd, @disease_type, @start_year, @start_month, @end_year, @end_month)
      `);

    logger.info(`Block added: ${hos_cd}|${hos_cso_cd}|${drug_cd}|${newSeq}`);
    res.json({ success: true, seq: newSeq });
  } catch (error) {
    logger.error('블록 추가 실패:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 블록 일괄 저장 API
 * POST /api/blocks/batch
 */
router.post('/api/blocks/batch', async (req: Request, res: Response) => {
  try {
    const { uuid, token } = req.query;

    // 토큰 검증
    const tokenData = await validatePageToken(uuid as string, token as string);
    if (!tokenData) {
      return res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
    }

    const { diseases, deletions } = req.body;
    const { hos_cd, hos_cso_cd } = tokenData;

    const pool = await getConnection();

    // 진료과 변경 처리
    for (const change of diseases || []) {
      const [drug_cd, seq] = change.blockKey.split('|');

      if (change.action === 'add') {
        // 진료과 추가
        await pool.request()
          .input('hos_cd', sql.NVarChar, hos_cd)
          .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
          .input('drug_cd', sql.NVarChar, drug_cd)
          .input('seq', sql.NVarChar, seq)
          .input('disease_type', sql.NVarChar, change.disease_type)
          .input('start_year', sql.Int, change.start_year)
          .input('start_month', sql.Int, change.start_month)
          .input('end_year', sql.Int, change.end_year)
          .input('end_month', sql.Int, change.end_month)
          .query(`
            INSERT INTO BLOCK_TBL (hos_cd, hos_cso_cd, drug_cd, seq, cso_cd, disease_type, start_year, start_month, end_year, end_month)
            SELECT @hos_cd, @hos_cso_cd, @drug_cd, @seq, cso_cd, @disease_type, @start_year, @start_month, @end_year, @end_month
            FROM BLOCK_TBL
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq
            AND NOT EXISTS (
              SELECT 1 FROM BLOCK_TBL
              WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq AND disease_type = @disease_type
            )
          `);
      } else if (change.action === 'edit' || change.action === 'end') {
        // 진료과 수정/종료
        await pool.request()
          .input('hos_cd', sql.NVarChar, hos_cd)
          .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
          .input('drug_cd', sql.NVarChar, drug_cd)
          .input('seq', sql.NVarChar, seq)
          .input('disease_type', sql.NVarChar, change.disease_type)
          .input('start_year', sql.Int, change.start_year)
          .input('start_month', sql.Int, change.start_month)
          .input('end_year', sql.Int, change.end_year)
          .input('end_month', sql.Int, change.end_month)
          .query(`
            UPDATE BLOCK_TBL
            SET start_year = @start_year, start_month = @start_month, end_year = @end_year, end_month = @end_month
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq AND disease_type = @disease_type
          `);
      }
    }

    // 삭제 처리
    for (const deletion of deletions || []) {
      await pool.request()
        .input('hos_cd', sql.NVarChar, hos_cd)
        .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
        .input('drug_cd', sql.NVarChar, deletion.drug_cd)
        .input('seq', sql.NVarChar, deletion.seq)
        .query(`
          DELETE FROM BLOCK_TBL
          WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq
        `);
    }

    logger.info(`Batch update: ${(diseases || []).length} changes, ${(deletions || []).length} deletions`);
    res.json({ success: true });
  } catch (error) {
    logger.error('일괄 저장 실패:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * CSO 검색 API
 * GET /api/cso?keyword=xxx
 */
router.get('/api/cso', async (req: Request, res: Response) => {
  try {
    const { uuid, token, keyword } = req.query;

    // 토큰 검증
    const tokenData = await validatePageToken(uuid as string, token as string);
    if (!tokenData) {
      return res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
    }

    if (!keyword || (keyword as string).length < 1) {
      return res.json({ data: [] });
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('keyword', sql.NVarChar, `%${keyword}%`)
      .query(`
        SELECT TOP 10 cso_cd, cso_dealer_nm, cso_corp_nm
        FROM CSO_TBL
        WHERE cso_dealer_nm LIKE @keyword OR cso_corp_nm LIKE @keyword
        ORDER BY cso_dealer_nm
      `);

    res.json({ data: result.recordset });
  } catch (error) {
    logger.error('CSO 검색 실패:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

export default router;
