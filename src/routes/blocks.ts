/**
 * 블록 수정 페이지 라우터
 * - /blocks: 블록 수정 페이지 서빙
 * - /api/blocks: 블록 관련 API
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import { validatePageToken, createPageToken } from '../services/token/pageToken';
import { getConnection } from '../services/database/connection';
import { sendTextMessage } from '../services/naverworks/message';
import { config } from '../config';
import sql from 'mssql';
import { logger } from '../utils/logger';
import { yearMonthToIndex } from '../services/sales/periodService';

const router = Router();

/**
 * 블록 수정 페이지 서빙
 * GET /blocks?uuid=xxx&token=xxx
 */
router.get('/blocks', async (req: Request, res: Response) => {
  logger.info(`[blocks] GET /blocks 요청 수신 - uuid: ${req.query.uuid}`);

  const { uuid, token } = req.query;

  if (!uuid || !token) {
    logger.warn('[blocks] uuid 또는 token 누락');
    return res.status(400).send('잘못된 접근입니다.');
  }

  // 토큰 검증
  const tokenData = await validatePageToken(uuid as string, token as string);
  if (!tokenData) {
    logger.warn(`[blocks] 토큰 검증 실패 - uuid: ${uuid}`);
    return res.status(401).send('유효하지 않거나 만료된 링크입니다.');
  }

  logger.info(`[blocks] 토큰 검증 성공 - hos_cd: ${tokenData.hos_cd}`);

  // 페이지 서빙
  const filePath = path.join(__dirname, '../public/index.html');
  logger.info(`[blocks] 파일 경로: ${filePath}`);

  res.sendFile(filePath, (err) => {
    if (err) {
      logger.error(`[blocks] 파일 서빙 실패: ${err.message}`);
      res.status(404).send('페이지를 찾을 수 없습니다.');
    }
  });
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

    // 블록 목록 조회 (V_BLOCK_FOR_EDIT_byClaude 뷰 사용)
    const blocksResult = await pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`
        SELECT *
        FROM V_BLOCK_FOR_EDIT_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
        ORDER BY is_current DESC, drug_name, seq, cso_cd, disease_type
      `);

    // 그룹화: drug_cd + seq + cso_cd 기준으로 묶고, diseases 배열로 정리
    const blockMap = new Map<string, any>();
    for (const row of blocksResult.recordset) {
      const key = `${row.drug_cd}|${row.seq}|${row.cso_cd}`;
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
          is_current: row.is_current,
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
        // 하나라도 진행 중인 disease가 있으면 블록을 현재로 처리
        if (row.is_current === 1) {
          blockMap.get(key).is_current = 1;
        }
      }
    }

    res.json({
      hospitalName,
      hosCd: hos_cd,
      hosCsoCd: hos_cso_cd,
      expiresAt: tokenData.expires_at,
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

    const { drug_cd, cso_cd, disease_type, start_year, start_month, end_year, end_month, isFirst } = req.body;
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

    // index 계산
    const start_index = yearMonthToIndex(start_year, start_month);
    const end_index = yearMonthToIndex(end_year, end_month);

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
      .input('start_index', sql.Int, start_index)
      .input('end_year', sql.Int, end_year)
      .input('end_month', sql.Int, end_month)
      .input('end_index', sql.Int, end_index)
      .input('block_isvalid', sql.NVarChar, 'Y')
      .input('isFirst', sql.NVarChar, isFirst ? 'Y' : 'N')
      .query(`
        INSERT INTO BLOCK_TBL (hos_cd, hos_cso_cd, drug_cd, seq, cso_cd, disease_type, start_year, start_month, start_index, end_year, end_month, end_index, block_isvalid, isFirst, update_at)
        VALUES (@hos_cd, @hos_cso_cd, @drug_cd, @seq, @cso_cd, @disease_type, @start_year, @start_month, @start_index, @end_year, @end_month, @end_index, @block_isvalid, @isFirst, DATEADD(HOUR, 9, GETUTCDATE()))
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
      const [drug_cd, seq, cso_cd] = change.blockKey.split('|');

      // index 계산
      const start_index = yearMonthToIndex(change.start_year, change.start_month);
      const end_index = yearMonthToIndex(change.end_year, change.end_month);

      if (change.action === 'add') {
        // 진료과 추가
        await pool.request()
          .input('hos_cd', sql.NVarChar, hos_cd)
          .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
          .input('drug_cd', sql.NVarChar, drug_cd)
          .input('seq', sql.NVarChar, seq)
          .input('cso_cd', sql.NVarChar, cso_cd)
          .input('disease_type', sql.NVarChar, change.disease_type)
          .input('start_year', sql.Int, change.start_year)
          .input('start_month', sql.Int, change.start_month)
          .input('start_index', sql.Int, start_index)
          .input('end_year', sql.Int, change.end_year)
          .input('end_month', sql.Int, change.end_month)
          .input('end_index', sql.Int, end_index)
          .input('block_isvalid', sql.NVarChar, 'Y')
          .query(`
            INSERT INTO BLOCK_TBL (hos_cd, hos_cso_cd, drug_cd, seq, cso_cd, disease_type, start_year, start_month, start_index, end_year, end_month, end_index, block_isvalid, isFirst, update_at)
            SELECT @hos_cd, @hos_cso_cd, @drug_cd, @seq, cso_cd, @disease_type, @start_year, @start_month, @start_index, @end_year, @end_month, @end_index, @block_isvalid, isFirst, DATEADD(HOUR, 9, GETUTCDATE())
            FROM BLOCK_TBL
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq AND cso_cd = @cso_cd
            AND NOT EXISTS (
              SELECT 1 FROM BLOCK_TBL
              WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq AND cso_cd = @cso_cd AND disease_type = @disease_type
            )
          `);
      } else if (change.action === 'edit' || change.action === 'end') {
        // 진료과 수정/종료
        await pool.request()
          .input('hos_cd', sql.NVarChar, hos_cd)
          .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
          .input('drug_cd', sql.NVarChar, drug_cd)
          .input('seq', sql.NVarChar, seq)
          .input('cso_cd', sql.NVarChar, cso_cd)
          .input('disease_type', sql.NVarChar, change.disease_type)
          .input('start_year', sql.Int, change.start_year)
          .input('start_month', sql.Int, change.start_month)
          .input('start_index', sql.Int, start_index)
          .input('end_year', sql.Int, change.end_year)
          .input('end_month', sql.Int, change.end_month)
          .input('end_index', sql.Int, end_index)
          .query(`
            UPDATE BLOCK_TBL
            SET start_year = @start_year, start_month = @start_month, start_index = @start_index,
                end_year = @end_year, end_month = @end_month, end_index = @end_index,
                update_at = DATEADD(HOUR, 9, GETUTCDATE())
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq AND cso_cd = @cso_cd AND disease_type = @disease_type
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
        .input('cso_cd', sql.NVarChar, deletion.cso_cd)
        .query(`
          DELETE FROM BLOCK_TBL
          WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd AND seq = @seq AND cso_cd = @cso_cd
        `);
    }

    logger.info(`Batch update: ${(diseases || []).length} changes, ${(deletions || []).length} deletions`);

    // 변경내역이 있으면 관리자에게 메시지 전송
    const totalChanges = (diseases || []).length + (deletions || []).length;
    if (totalChanges > 0 && config.naverWorks.notifyUserId) {
      try {
        // 병원명 조회
        const hospitalResult = await pool.request()
          .input('hos_cd', sql.NVarChar, hos_cd)
          .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
          .query(`SELECT hos_name, hos_abbr FROM HOSPITAL_TBL WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd`);

        const hospital = hospitalResult.recordset[0];
        const hospitalName = hospital?.hos_abbr || hospital?.hos_name || `${hos_cd}|${hos_cso_cd}`;

        // CSO 및 품목 정보 조회를 위한 코드 수집
        const csoCodes = new Set<string>();
        const drugCodes = new Set<string>();

        for (const d of diseases || []) {
          const [drug_cd, , cso_cd] = d.blockKey.split('|');
          csoCodes.add(cso_cd);
          drugCodes.add(drug_cd);
        }
        for (const del of deletions || []) {
          csoCodes.add(del.cso_cd);
          drugCodes.add(del.drug_cd);
        }

        // CSO 정보 조회
        const csoMap: Record<string, string> = {};
        if (csoCodes.size > 0) {
          const csoResult = await pool.request().query(`
            SELECT cso_cd, cso_dealer_nm FROM CSO_TBL WHERE cso_cd IN ('${Array.from(csoCodes).join("','")}')
          `);
          for (const row of csoResult.recordset) {
            csoMap[row.cso_cd] = row.cso_dealer_nm;
          }
        }

        // 품목 정보 조회
        const drugMap: Record<string, string> = {};
        if (drugCodes.size > 0) {
          const drugResult = await pool.request().query(`
            SELECT drug_cd, drug_name FROM DRUG_TBL WHERE drug_cd IN ('${Array.from(drugCodes).join("','")}') AND end_index = 1199
          `);
          for (const row of drugResult.recordset) {
            drugMap[row.drug_cd] = row.drug_name;
          }
        }

        // 변경내역 메시지 생성
        let message = `[블록 수정 완료]\n병원: ${hospitalName}\n`;

        // 신규 추가
        const addItems = (diseases || []).filter((d: any) => d.action === 'add');
        if (addItems.length > 0) {
          message += `\n▶ 신규 추가\n`;
          for (const d of addItems.slice(0, 5)) {
            const [drug_cd, , cso_cd] = d.blockKey.split('|');
            const drugName = drugMap[drug_cd] || drug_cd;
            const csoName = csoMap[cso_cd] || cso_cd;
            message += `  - ${drugName} / ${csoName} / ${d.disease_type}\n`;
          }
          if (addItems.length > 5) message += `  ... 외 ${addItems.length - 5}건\n`;
        }

        // 기존 수정
        const editItems = (diseases || []).filter((d: any) => d.action === 'edit');
        if (editItems.length > 0) {
          message += `\n▶ 기존 수정\n`;
          for (const d of editItems.slice(0, 5)) {
            const [drug_cd, , cso_cd] = d.blockKey.split('|');
            const drugName = drugMap[drug_cd] || drug_cd;
            const csoName = csoMap[cso_cd] || cso_cd;
            message += `  - ${drugName} / ${csoName} / ${d.disease_type}\n`;
          }
          if (editItems.length > 5) message += `  ... 외 ${editItems.length - 5}건\n`;
        }

        // 종료
        const endItems = (diseases || []).filter((d: any) => d.action === 'end');
        if (endItems.length > 0) {
          message += `\n▶ 종료 처리\n`;
          for (const d of endItems.slice(0, 5)) {
            const [drug_cd, , cso_cd] = d.blockKey.split('|');
            const drugName = drugMap[drug_cd] || drug_cd;
            const csoName = csoMap[cso_cd] || cso_cd;
            message += `  - ${drugName} / ${csoName} / ${d.disease_type} (~${d.end_year}.${String(d.end_month).padStart(2, '0')})\n`;
          }
          if (endItems.length > 5) message += `  ... 외 ${endItems.length - 5}건\n`;
        }

        // CSO 삭제
        if ((deletions || []).length > 0) {
          message += `\n▶ CSO 삭제\n`;
          for (const del of (deletions || []).slice(0, 5)) {
            const drugName = drugMap[del.drug_cd] || del.drug_cd;
            const csoName = csoMap[del.cso_cd] || del.cso_cd;
            message += `  - ${drugName} / ${csoName}\n`;
          }
          if (deletions.length > 5) message += `  ... 외 ${deletions.length - 5}건\n`;
        }

        await sendTextMessage(config.naverWorks.notifyUserId, message);
        logger.info(`Block change notification sent to ${config.naverWorks.notifyUserId}`);
      } catch (notifyError) {
        logger.error('변경내역 알림 전송 실패:', notifyError);
        // 알림 실패해도 저장은 성공으로 처리
      }
    }

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

/**
 * 품목 검색 API
 * GET /api/drugs?keyword=xxx
 */
router.get('/api/drugs', async (req: Request, res: Response) => {
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
        SELECT TOP 10 drug_cd, drug_name
        FROM DRUG_TBL
        WHERE (drug_name LIKE @keyword OR drug_cd LIKE @keyword)
          AND end_index = 1199
        ORDER BY drug_name
      `);

    res.json({ data: result.recordset });
  } catch (error) {
    logger.error('품목 검색 실패:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 병원 검색 API
 * GET /api/hospitals?keyword=xxx
 */
router.get('/api/hospitals', async (req: Request, res: Response) => {
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
        SELECT TOP 10 hos_cd, hos_cso_cd, hos_name, hos_abbr
        FROM HOSPITAL_TBL
        WHERE hos_name LIKE @keyword OR hos_abbr LIKE @keyword
        ORDER BY hos_name
      `);

    res.json({ data: result.recordset });
  } catch (error) {
    logger.error('병원 검색 실패:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 병원 변경 (토큰 재발급) API
 * POST /api/blocks/switch-hospital
 */
router.post('/api/blocks/switch-hospital', async (req: Request, res: Response) => {
  try {
    const { uuid, token } = req.query;

    // 현재 토큰 검증
    const tokenData = await validatePageToken(uuid as string, token as string);
    if (!tokenData) {
      return res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
    }

    const { hos_cd, hos_cso_cd } = req.body;
    if (!hos_cd || !hos_cso_cd) {
      return res.status(400).json({ message: '병원 정보가 필요합니다.' });
    }

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

    if (hospitalResult.recordset.length === 0) {
      return res.status(404).json({ message: '병원을 찾을 수 없습니다.' });
    }

    const hospital = hospitalResult.recordset[0];
    const hospitalName = hospital.hos_abbr || hospital.hos_name || '병원명';

    // 새 토큰 생성 (기존 user_id 사용, 60분 유효)
    const newToken = await createPageToken(hos_cd, hos_cso_cd, tokenData.user_id, 60);

    logger.info(`Hospital switched: ${tokenData.user_id} -> ${hos_cd}|${hos_cso_cd}`);

    res.json({
      uuid: newToken.uuid,
      token: newToken.token,
      hospitalName,
      hosCd: hos_cd,
      hosCsoCd: hos_cso_cd,
    });
  } catch (error) {
    logger.error('병원 변경 실패:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

export default router;
