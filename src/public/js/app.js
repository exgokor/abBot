/**
 * 담당 관리 웹 페이지 - 프론트엔드 로직
 *
 * API 엔드포인트:
 * - GET  /api/blocks       : 병원의 품목별 담당 목록 조회
 * - POST /api/blocks       : 신규 담당 배정 추가
 * - PUT  /api/blocks       : 담당 정보 수정
 * - PATCH /api/blocks/end  : 담당 종료 (논리 삭제)
 * - GET  /api/cso          : CSO 자동완성 검색
 */

// ========================================
// 전역 상태
// ========================================
const state = {
  uuid: null,           // URL 토큰 uuid
  token: null,          // URL 토큰 token
  hospitalName: '',     // 병원명
  hosCd: '',            // 병원코드1
  hosCsoCd: '',         // 병원코드2
  blocks: [],           // 담당 목록
  drugs: [],            // 품목 목록 (CSO 추가용)
  csoList: [],          // CSO 자동완성 목록
  selectedCso: null,    // 선택된 CSO
};

// ========================================
// 변경사항 추적
// ========================================
const changes = {
  // 진료과 변경 목록 (추가/수정/종료)
  // { blockKey, action: 'add'|'update'|'end', disease_type, start_year, start_month, end_year, end_month }
  diseases: [],

  // CSO 블록 삭제 목록
  // { blockKey, hos_cd, hos_cso_cd, drug_cd, seq }
  deletions: [],
};

/**
 * 변경사항 추가
 */
function addChange(type, data) {
  const list = changes[type];
  const blockKey = data.blockKey;

  if (type === 'diseases') {
    // 같은 블록의 같은 진료과에 대한 기존 변경 찾기
    const existingIdx = list.findIndex(
      c => c.blockKey === blockKey && c.disease_type === data.disease_type
    );

    if (existingIdx !== -1) {
      // 기존 변경 덮어쓰기
      list[existingIdx] = data;
    } else {
      list.push(data);
    }
  } else if (type === 'deletions') {
    // 중복 방지
    if (!list.find(c => c.blockKey === blockKey)) {
      list.push(data);
    }
  }

  updateChangesBar();
}

/**
 * 변경사항 제거
 */
function removeChange(type, blockKey, diseaseType = null) {
  if (type === 'diseases' && diseaseType) {
    const idx = changes.diseases.findIndex(
      c => c.blockKey === blockKey && c.disease_type === diseaseType
    );
    if (idx !== -1) changes.diseases.splice(idx, 1);
  } else if (type === 'deletions') {
    const idx = changes.deletions.findIndex(c => c.blockKey === blockKey);
    if (idx !== -1) changes.deletions.splice(idx, 1);
  }
  updateChangesBar();
}

/**
 * 변경사항 바 업데이트
 */
function updateChangesBar() {
  const total = changes.diseases.length + changes.deletions.length;
  const changesBar = document.getElementById('changesBar');
  const changesCount = document.getElementById('changesCount');

  if (total > 0) {
    changesBar.style.display = 'flex';
    changesCount.textContent = `${total}개의 변경사항`;
  } else {
    changesBar.style.display = 'none';
  }
}

/**
 * 변경사항 초기화
 */
function clearChanges() {
  changes.diseases = [];
  changes.deletions = [];
  updateChangesBar();
}

// ========================================
// DOM 요소
// ========================================
const elements = {
  loading: document.getElementById('loading'),
  hospitalName: document.getElementById('hospitalName'),
  blockList: document.getElementById('blockList'),
  emptyMessage: document.getElementById('emptyMessage'),
  btnAddCso: document.getElementById('btnAddCso'),

  // CSO 삭제 모달
  deleteModal: document.getElementById('deleteModal'),
  deleteHospitalName: document.getElementById('deleteHospitalName'),
  deleteCsoName: document.getElementById('deleteCsoName'),
  deleteHosCd: document.getElementById('deleteHosCd'),
  deleteHosCsoCd: document.getElementById('deleteHosCsoCd'),
  deleteDrugCd: document.getElementById('deleteDrugCd'),
  deleteSeq: document.getElementById('deleteSeq'),
  btnDeleteCancel: document.getElementById('btnDeleteCancel'),
  btnDeleteConfirm: document.getElementById('btnDeleteConfirm'),

  // 진료과 추가/수정 모달
  diseaseModal: document.getElementById('diseaseModal'),
  diseaseModalTitle: document.getElementById('diseaseModalTitle'),
  diseaseNameGroup: document.getElementById('diseaseNameGroup'),
  diseaseNameInput: document.getElementById('diseaseNameInput'),
  diseaseStartYear: document.getElementById('diseaseStartYear'),
  diseaseStartMonth: document.getElementById('diseaseStartMonth'),
  diseaseEndYear: document.getElementById('diseaseEndYear'),
  diseaseEndMonth: document.getElementById('diseaseEndMonth'),
  diseaseBlockKey: document.getElementById('diseaseBlockKey'),
  diseaseMode: document.getElementById('diseaseMode'),
  diseaseOriginal: document.getElementById('diseaseOriginal'),
  btnDiseaseCancel: document.getElementById('btnDiseaseCancel'),
  btnDiseaseConfirm: document.getElementById('btnDiseaseConfirm'),

  // CSO 추가 모달
  addModal: document.getElementById('addModal'),
  addDrugSelect: document.getElementById('addDrugSelect'),
  addCsoSearch: document.getElementById('addCsoSearch'),
  csoSuggestions: document.getElementById('csoSuggestions'),
  addCsoCd: document.getElementById('addCsoCd'),
  selectedCsoInfo: document.getElementById('selectedCsoInfo'),
  addDisease: document.getElementById('addDisease'),
  addStartYear: document.getElementById('addStartYear'),
  addStartMonth: document.getElementById('addStartMonth'),
  addIsFirst: document.getElementById('addIsFirst'),
  btnAddCancel: document.getElementById('btnAddCancel'),
  btnAddConfirm: document.getElementById('btnAddConfirm'),

  // 토스트
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toastMessage'),

  // 변경사항 바
  changesBar: document.getElementById('changesBar'),
  changesCount: document.getElementById('changesCount'),
  btnSaveChanges: document.getElementById('btnSaveChanges'),
};

// ========================================
// 유틸리티 함수
// ========================================

/**
 * URL 쿼리 파라미터 파싱
 */
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    uuid: params.get('uuid'),
    token: params.get('token'),
  };
}

/**
 * API 요청 헬퍼
 */
async function apiRequest(endpoint, options = {}) {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('uuid', state.uuid);
  url.searchParams.set('token', state.token);

  const response = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || '요청 실패');
  }

  return data;
}

/**
 * 토스트 메시지 표시
 */
function showToast(message, type = 'default') {
  elements.toast.className = `toast ${type}`;
  elements.toastMessage.textContent = message;
  elements.toast.style.display = 'block';

  setTimeout(() => {
    elements.toast.style.display = 'none';
  }, 3000);
}

/**
 * 로딩 표시/숨김
 */
function setLoading(show) {
  elements.loading.style.display = show ? 'flex' : 'none';
}

/**
 * 기간 포맷 (YYYY.MM)
 */
function formatPeriod(year, month) {
  if (!year || !month) return '-';
  return `${year}.${String(month).padStart(2, '0')}`;
}

/**
 * 종료 여부 확인 (2099년이면 진행중)
 */
function isOngoing(endYear) {
  return !endYear || endYear >= 2099;
}

/**
 * 년도 옵션 생성 (현재년도 기준 ±5년 + 2099)
 */
function generateYearOptions(selectElement, selectedYear = null, includeInfinite = false) {
  const currentYear = new Date().getFullYear();
  selectElement.innerHTML = '<option value="">년도</option>';

  for (let year = currentYear - 3; year <= currentYear + 5; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = `${year}년`;
    if (selectedYear && parseInt(selectedYear) === year) {
      option.selected = true;
    }
    selectElement.appendChild(option);
  }

  // 무기한 옵션 (2099년)
  if (includeInfinite) {
    const infiniteOption = document.createElement('option');
    infiniteOption.value = 2099;
    infiniteOption.textContent = '무기한';
    if (selectedYear && parseInt(selectedYear) >= 2099) {
      infiniteOption.selected = true;
    }
    selectElement.appendChild(infiniteOption);
  }
}

/**
 * 월 옵션 생성
 */
function generateMonthOptions(selectElement, selectedMonth = null) {
  selectElement.innerHTML = '<option value="">월</option>';

  for (let month = 1; month <= 12; month++) {
    const option = document.createElement('option');
    option.value = month;
    option.textContent = `${month}월`;
    if (selectedMonth && parseInt(selectedMonth) === month) {
      option.selected = true;
    }
    selectElement.appendChild(option);
  }
}

// ========================================
// 데이터 로드
// ========================================

/**
 * 담당 목록 조회
 */
async function loadBlocks() {
  try {
    const response = await apiRequest('/api/blocks');

    state.hospitalName = response.hospitalName || '병원명';
    state.hosCd = response.hosCd;
    state.hosCsoCd = response.hosCsoCd;
    state.blocks = response.data || [];

    // 병원명 표시
    elements.hospitalName.textContent = state.hospitalName;

    // 품목 목록 추출 (중복 제거)
    const drugMap = new Map();
    state.blocks.forEach(block => {
      if (!drugMap.has(block.drug_cd)) {
        drugMap.set(block.drug_cd, block.drug_name);
      }
    });
    state.drugs = Array.from(drugMap, ([drug_cd, drug_name]) => ({ drug_cd, drug_name }));

    renderBlocks();
  } catch (error) {
    console.error('담당 목록 로드 실패:', error);
    showToast(error.message || '데이터 로드 실패', 'error');
  }
}

// ========================================
// UI 렌더링
// ========================================

/**
 * 담당 목록 렌더링
 */
function renderBlocks() {
  if (state.blocks.length === 0) {
    elements.blockList.innerHTML = '';
    elements.emptyMessage.style.display = 'block';
    return;
  }

  elements.emptyMessage.style.display = 'none';

  // 품목별 그룹화
  const grouped = {};
  state.blocks.forEach(block => {
    if (!grouped[block.drug_cd]) {
      grouped[block.drug_cd] = {
        drug_name: block.drug_name,
        blocks: [],
      };
    }
    grouped[block.drug_cd].blocks.push(block);
  });

  // HTML 생성
  let html = '';

  for (const drugCd in grouped) {
    const group = grouped[drugCd];

    html += `
      <div class="drug-group" data-drug-cd="${drugCd}">
        <div class="drug-group-header">${group.drug_name}</div>
        ${group.blocks.map(block => renderBlockCard(block)).join('')}
      </div>
    `;
  }

  elements.blockList.innerHTML = html;

  // 이벤트 바인딩
  bindBlockEvents();
}

/**
 * 개별 담당 카드 렌더링
 */
function renderBlockCard(block) {
  const blockKey = `${block.drug_cd}|${block.seq}`;
  const diseases = block.diseases || [];

  return `
    <div class="block-card"
         data-hos-cd="${block.hos_cd}"
         data-hos-cso-cd="${block.hos_cso_cd}"
         data-drug-cd="${block.drug_cd}"
         data-seq="${block.seq}"
         data-block-key="${blockKey}">

      <!-- CSO 정보 헤더 -->
      <div class="cso-header">
        <div class="cso-info">
          <div class="cso-name">${block.cso_dealer_nm || '-'}</div>
          <div class="cso-corp">${block.cso_corp_nm || ''}</div>
        </div>
        <button class="btn-delete" data-cso-name="${block.cso_dealer_nm || ''}">
          삭제
        </button>
      </div>

      <!-- 진료과 Chips (기간 포함) -->
      <div class="block-card-field">
        <div class="field-label">진료과</div>
        <div class="disease-chips-container" data-block-key="${blockKey}">
          ${diseases.map(d => renderDiseaseChip(d, blockKey)).join('')}
          <button class="disease-add-btn" data-block-key="${blockKey}">
            + 추가
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 진료과 Chip 렌더링 (기간 포함)
 */
function renderDiseaseChip(disease, blockKey) {
  const startPeriod = formatPeriod(disease.start_year, disease.start_month);
  const endPeriod = isOngoing(disease.end_year) ? '진행중' : formatPeriod(disease.end_year, disease.end_month);
  const isEnded = !isOngoing(disease.end_year);

  return `
    <span class="disease-chip ${isEnded ? 'ended' : ''}"
          data-disease="${disease.name}"
          data-start-year="${disease.start_year}"
          data-start-month="${disease.start_month}"
          data-end-year="${disease.end_year}"
          data-end-month="${disease.end_month}"
          data-block-key="${blockKey}">
      <span class="disease-chip-content">
        <span class="disease-name">${disease.name}</span>
        <span class="disease-period">${startPeriod}~${endPeriod}</span>
      </span>
      <button class="disease-chip-end" data-disease="${disease.name}" title="종료 설정">&times;</button>
    </span>
  `;
}

/**
 * 담당 카드 이벤트 바인딩
 */
function bindBlockEvents() {
  // 진료과 Chip 클릭 (수정)
  document.querySelectorAll('.disease-chip').forEach(chip => {
    chip.addEventListener('click', handleDiseaseChipClick);
  });

  // 진료과 종료 버튼 (X 버튼)
  document.querySelectorAll('.disease-chip-end').forEach(btn => {
    btn.addEventListener('click', handleDiseaseEndClick);
  });

  // 진료과 추가 버튼
  document.querySelectorAll('.disease-add-btn').forEach(btn => {
    btn.addEventListener('click', handleDiseaseAddClick);
  });

  // CSO 삭제 버튼
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', handleDeleteClick);
  });
}

// ========================================
// 진료과 모달 핸들러
// ========================================

/**
 * 진료과 Chip 클릭 핸들러 (기간 수정)
 */
function handleDiseaseChipClick(e) {
  // X 버튼 클릭은 무시
  if (e.target.classList.contains('disease-chip-end')) return;

  const chip = e.currentTarget;
  const blockKey = chip.dataset.blockKey;
  const disease = chip.dataset.disease;

  // 모달 설정 (수정 모드)
  elements.diseaseModalTitle.textContent = '진료과 기간 수정';
  elements.diseaseNameGroup.style.display = 'none';
  elements.diseaseNameInput.value = disease;

  elements.diseaseBlockKey.value = blockKey;
  elements.diseaseMode.value = 'edit';
  elements.diseaseOriginal.value = disease;

  // 기존 기간 설정
  generateYearOptions(elements.diseaseStartYear, chip.dataset.startYear);
  generateMonthOptions(elements.diseaseStartMonth, chip.dataset.startMonth);
  generateYearOptions(elements.diseaseEndYear, chip.dataset.endYear, true);
  generateMonthOptions(elements.diseaseEndMonth, chip.dataset.endMonth);

  elements.diseaseModal.style.display = 'flex';
}

/**
 * 진료과 종료 버튼 클릭 핸들러 (X 버튼)
 */
function handleDiseaseEndClick(e) {
  e.stopPropagation();
  const btn = e.target;
  const chip = btn.closest('.disease-chip');
  const blockKey = chip.dataset.blockKey;
  const disease = btn.dataset.disease;

  // 이미 종료된 진료과면 무시
  if (!isOngoing(parseInt(chip.dataset.endYear))) {
    showToast('이미 종료된 진료과입니다.', 'error');
    return;
  }

  // 모달 설정 (종료 모드)
  elements.diseaseModalTitle.textContent = '진료과 종료';
  elements.diseaseNameGroup.style.display = 'none';
  elements.diseaseNameInput.value = disease;

  elements.diseaseBlockKey.value = blockKey;
  elements.diseaseMode.value = 'end';
  elements.diseaseOriginal.value = disease;

  // 시작 기간은 기존 값 (수정 불가)
  generateYearOptions(elements.diseaseStartYear, chip.dataset.startYear);
  generateMonthOptions(elements.diseaseStartMonth, chip.dataset.startMonth);
  elements.diseaseStartYear.disabled = true;
  elements.diseaseStartMonth.disabled = true;

  // 종료 기간은 오늘 날짜로 기본 설정
  const now = new Date();
  generateYearOptions(elements.diseaseEndYear, now.getFullYear(), false);
  generateMonthOptions(elements.diseaseEndMonth, now.getMonth() + 1);

  elements.diseaseModal.style.display = 'flex';
}

/**
 * 진료과 추가 버튼 클릭 핸들러
 */
function handleDiseaseAddClick(e) {
  const blockKey = e.target.dataset.blockKey;

  // 모달 설정 (추가 모드)
  elements.diseaseModalTitle.textContent = '진료과 추가';
  elements.diseaseNameGroup.style.display = 'block';
  elements.diseaseNameInput.value = '';

  elements.diseaseBlockKey.value = blockKey;
  elements.diseaseMode.value = 'add';
  elements.diseaseOriginal.value = '';

  // 시작 기간은 오늘 날짜로 기본 설정
  const now = new Date();
  generateYearOptions(elements.diseaseStartYear, now.getFullYear());
  generateMonthOptions(elements.diseaseStartMonth, now.getMonth() + 1);
  elements.diseaseStartYear.disabled = false;
  elements.diseaseStartMonth.disabled = false;

  // 종료 기간은 무기한(2099.12)으로 기본 설정
  generateYearOptions(elements.diseaseEndYear, 2099, true);
  generateMonthOptions(elements.diseaseEndMonth, 12);

  elements.diseaseModal.style.display = 'flex';
}

/**
 * 진료과 모달 확인 버튼 핸들러
 */
function handleDiseaseConfirm() {
  const mode = elements.diseaseMode.value;
  const blockKey = elements.diseaseBlockKey.value;
  const diseaseName = mode === 'add' ? elements.diseaseNameInput.value.trim() : elements.diseaseOriginal.value;

  const startYear = parseInt(elements.diseaseStartYear.value);
  const startMonth = parseInt(elements.diseaseStartMonth.value);
  const endYear = parseInt(elements.diseaseEndYear.value);
  const endMonth = parseInt(elements.diseaseEndMonth.value);

  // 유효성 검사
  if (mode === 'add' && !diseaseName) {
    showToast('진료과명을 입력해주세요.', 'error');
    return;
  }
  if (!startYear || !startMonth) {
    showToast('시작년월을 선택해주세요.', 'error');
    return;
  }
  if (!endYear || !endMonth) {
    showToast('종료년월을 선택해주세요.', 'error');
    return;
  }

  // 시작일이 종료일보다 늦으면 안됨
  if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
    showToast('종료년월은 시작년월 이후여야 합니다.', 'error');
    return;
  }

  // 변경사항 추가
  addChange('diseases', {
    blockKey,
    action: mode,
    disease_type: diseaseName,
    start_year: startYear,
    start_month: startMonth,
    end_year: endYear,
    end_month: endMonth,
  });

  // UI 업데이트
  const container = document.querySelector(`.disease-chips-container[data-block-key="${blockKey}"]`);
  if (container) {
    if (mode === 'add') {
      // 새 Chip 추가
      const addBtn = container.querySelector('.disease-add-btn');
      const newChipHTML = renderDiseaseChip(
        { name: diseaseName, start_year: startYear, start_month: startMonth, end_year: endYear, end_month: endMonth },
        blockKey
      );
      addBtn.insertAdjacentHTML('beforebegin', newChipHTML);

      // 새 Chip에 이벤트 바인딩
      const newChip = container.querySelector(`.disease-chip[data-disease="${diseaseName}"]`);
      if (newChip) {
        newChip.classList.add('added');
        newChip.addEventListener('click', handleDiseaseChipClick);
        newChip.querySelector('.disease-chip-end').addEventListener('click', handleDiseaseEndClick);
      }
    } else {
      // 기존 Chip 업데이트
      const chip = container.querySelector(`.disease-chip[data-disease="${diseaseName}"]`);
      if (chip) {
        chip.dataset.startYear = startYear;
        chip.dataset.startMonth = startMonth;
        chip.dataset.endYear = endYear;
        chip.dataset.endMonth = endMonth;

        const startPeriod = formatPeriod(startYear, startMonth);
        const endPeriod = isOngoing(endYear) ? '진행중' : formatPeriod(endYear, endMonth);

        chip.querySelector('.disease-period').textContent = `${startPeriod}~${endPeriod}`;
        chip.classList.toggle('ended', !isOngoing(endYear));
        chip.classList.add('modified');
      }
    }
  }

  elements.diseaseModal.style.display = 'none';
  elements.diseaseStartYear.disabled = false;
  elements.diseaseStartMonth.disabled = false;

  const actionText = mode === 'add' ? '추가' : mode === 'end' ? '종료' : '수정';
  showToast(`진료과가 ${actionText}되었습니다. 저장 버튼을 눌러 확정하세요.`, 'success');
}

// ========================================
// CSO 삭제 핸들러
// ========================================

/**
 * 삭제 버튼 클릭 핸들러
 */
function handleDeleteClick(e) {
  const btn = e.target.closest('.btn-delete');
  const card = btn.closest('.block-card');

  // 삭제 대상 정보 설정
  elements.deleteHospitalName.textContent = `[${state.hospitalName}]`;
  elements.deleteCsoName.textContent = `[${btn.dataset.csoName || '-'}]`;

  elements.deleteHosCd.value = card.dataset.hosCd;
  elements.deleteHosCsoCd.value = card.dataset.hosCsoCd;
  elements.deleteDrugCd.value = card.dataset.drugCd;
  elements.deleteSeq.value = card.dataset.seq;

  // 모달 표시
  elements.deleteModal.style.display = 'flex';
}

/**
 * 삭제 확인 핸들러 (변경사항 추적)
 */
function handleDeleteConfirm() {
  const blockKey = `${elements.deleteDrugCd.value}|${elements.deleteSeq.value}`;

  // 변경사항에 삭제 추가
  addChange('deletions', {
    blockKey,
    hos_cd: elements.deleteHosCd.value,
    hos_cso_cd: elements.deleteHosCsoCd.value,
    drug_cd: elements.deleteDrugCd.value,
    seq: elements.deleteSeq.value,
  });

  // 카드를 시각적으로 삭제 표시
  const card = document.querySelector(`.block-card[data-block-key="${blockKey}"]`);
  if (card) {
    card.style.opacity = '0.5';
    card.style.pointerEvents = 'none';
    card.insertAdjacentHTML('beforeend', '<div class="deleted-overlay">삭제 예정</div>');
  }

  elements.deleteModal.style.display = 'none';
  showToast('삭제가 예약되었습니다. 저장 버튼을 눌러 확정하세요.', 'success');
}

// ========================================
// 저장 핸들러
// ========================================

/**
 * 변경사항 저장 핸들러
 */
async function handleSaveChanges() {
  const total = changes.diseases.length + changes.deletions.length;
  if (total === 0) {
    showToast('변경사항이 없습니다.', 'error');
    return;
  }

  try {
    setLoading(true);

    await apiRequest('/api/blocks/batch', {
      method: 'POST',
      body: JSON.stringify({
        hos_cd: state.hosCd,
        hos_cso_cd: state.hosCsoCd,
        diseases: changes.diseases,
        deletions: changes.deletions,
      }),
    });

    showToast(`${total}개의 변경사항이 저장되었습니다.`, 'success');
    clearChanges();

    // 목록 새로고침
    await loadBlocks();
  } catch (error) {
    console.error('저장 실패:', error);
    showToast(error.message || '저장 실패', 'error');
  } finally {
    setLoading(false);
  }
}

// ========================================
// CSO 추가 모달 핸들러
// ========================================

/**
 * CSO 추가 버튼 클릭 핸들러
 */
function handleAddClick() {
  // 폼 초기화
  elements.addDrugSelect.innerHTML = '<option value="">품목 선택</option>';
  state.drugs.forEach(drug => {
    const option = document.createElement('option');
    option.value = drug.drug_cd;
    option.textContent = drug.drug_name;
    elements.addDrugSelect.appendChild(option);
  });

  elements.addCsoSearch.value = '';
  elements.addCsoCd.value = '';
  elements.selectedCsoInfo.style.display = 'none';
  elements.csoSuggestions.style.display = 'none';
  elements.addDisease.value = '';

  generateYearOptions(elements.addStartYear, new Date().getFullYear());
  generateMonthOptions(elements.addStartMonth, new Date().getMonth() + 1);

  // 최초등록 체크박스 초기화
  elements.addIsFirst.checked = false;

  state.selectedCso = null;

  // 모달 표시
  elements.addModal.style.display = 'flex';
}

/**
 * CSO 검색 핸들러 (자동완성)
 */
let csoSearchTimeout = null;

async function handleCsoSearch(e) {
  const keyword = e.target.value.trim();

  clearTimeout(csoSearchTimeout);

  if (keyword.length < 1) {
    elements.csoSuggestions.style.display = 'none';
    return;
  }

  csoSearchTimeout = setTimeout(async () => {
    try {
      const csoResponse = await apiRequest(`/api/cso?keyword=${encodeURIComponent(keyword)}`);
      state.csoList = csoResponse.data || [];

      if (state.csoList.length === 0) {
        elements.csoSuggestions.innerHTML = '<div class="suggestion-item"><span class="suggestion-name">검색 결과 없음</span></div>';
      } else {
        elements.csoSuggestions.innerHTML = state.csoList.map(cso => `
          <div class="suggestion-item" data-cso-cd="${cso.cso_cd}" data-cso-name="${cso.cso_dealer_nm}" data-cso-corp="${cso.cso_corp_nm || ''}">
            <div class="suggestion-name">${cso.cso_dealer_nm}</div>
            <div class="suggestion-corp">${cso.cso_corp_nm || ''}</div>
          </div>
        `).join('');

        // 클릭 이벤트 바인딩
        elements.csoSuggestions.querySelectorAll('.suggestion-item[data-cso-cd]').forEach(item => {
          item.addEventListener('click', () => {
            selectCso(item.dataset.csoCd, item.dataset.csoName, item.dataset.csoCorp);
          });
        });
      }

      elements.csoSuggestions.style.display = 'block';
    } catch (error) {
      console.error('CSO 검색 실패:', error);
    }
  }, 300);
}

/**
 * CSO 선택 핸들러
 */
function selectCso(csoCd, csoName, csoCorp) {
  state.selectedCso = { cso_cd: csoCd, cso_dealer_nm: csoName, cso_corp_nm: csoCorp };

  elements.addCsoCd.value = csoCd;
  elements.addCsoSearch.value = csoName;
  elements.selectedCsoInfo.textContent = `${csoName} (${csoCorp || '-'})`;
  elements.selectedCsoInfo.style.display = 'block';
  elements.csoSuggestions.style.display = 'none';
}

/**
 * CSO 추가 확인 핸들러
 */
async function handleAddConfirm() {
  const drugCd = elements.addDrugSelect.value;
  const csoCd = elements.addCsoCd.value;
  const disease = elements.addDisease.value.trim();
  const startYear = elements.addStartYear.value;
  const startMonth = elements.addStartMonth.value;

  // 유효성 검사
  if (!drugCd) {
    showToast('품목을 선택해주세요.', 'error');
    return;
  }
  if (!csoCd) {
    showToast('CSO를 선택해주세요.', 'error');
    return;
  }
  if (!startYear || !startMonth) {
    showToast('시작년월을 선택해주세요.', 'error');
    return;
  }

  try {
    const isFirst = elements.addIsFirst.checked;

    await apiRequest('/api/blocks', {
      method: 'POST',
      body: JSON.stringify({
        hos_cd: state.hosCd,
        hos_cso_cd: state.hosCsoCd,
        drug_cd: drugCd,
        cso_cd: csoCd,
        disease_type: disease,
        start_year: parseInt(startYear),
        start_month: parseInt(startMonth),
        end_year: 2099,
        end_month: 12,
        isFirst: isFirst,
      }),
    });

    elements.addModal.style.display = 'none';
    showToast('담당이 추가되었습니다.', 'success');

    // 목록 새로고침
    await loadBlocks();
  } catch (error) {
    console.error('담당 추가 실패:', error);
    showToast(error.message || '추가 실패', 'error');
  }
}

// ========================================
// 초기화
// ========================================

async function init() {
  // URL 파라미터 파싱
  const params = getQueryParams();

  if (!params.uuid || !params.token) {
    alert('잘못된 접근입니다. URL을 확인해주세요.');
    return;
  }
  state.uuid = params.uuid;
  state.token = params.token;

  // 이벤트 바인딩
  elements.btnAddCso.addEventListener('click', handleAddClick);
  elements.btnDeleteCancel.addEventListener('click', () => {
    elements.deleteModal.style.display = 'none';
  });
  elements.btnDeleteConfirm.addEventListener('click', handleDeleteConfirm);
  elements.btnAddCancel.addEventListener('click', () => {
    elements.addModal.style.display = 'none';
  });
  elements.btnAddConfirm.addEventListener('click', handleAddConfirm);
  elements.addCsoSearch.addEventListener('input', handleCsoSearch);

  // 진료과 모달 이벤트
  elements.btnDiseaseCancel.addEventListener('click', () => {
    elements.diseaseModal.style.display = 'none';
    elements.diseaseStartYear.disabled = false;
    elements.diseaseStartMonth.disabled = false;
  });
  elements.btnDiseaseConfirm.addEventListener('click', handleDiseaseConfirm);

  // 변경사항 저장 버튼
  elements.btnSaveChanges.addEventListener('click', handleSaveChanges);

  // 모달 백드롭 클릭 시 닫기
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      backdrop.closest('.modal').style.display = 'none';
      elements.diseaseStartYear.disabled = false;
      elements.diseaseStartMonth.disabled = false;
    });
  });

  // CSO 검색창 외부 클릭 시 자동완성 닫기
  document.addEventListener('click', (e) => {
    if (!elements.addCsoSearch.contains(e.target) && !elements.csoSuggestions.contains(e.target)) {
      elements.csoSuggestions.style.display = 'none';
    }
  });

  // 데이터 로드
  try {
    await loadBlocks();
  } catch (error) {
    console.error('초기화 실패:', error);
    alert('데이터를 불러오는데 실패했습니다.');
  } finally {
    setLoading(false);
  }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', init);
