import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getAccessToken } from './auth';

interface NaverWorksUser {
  email: string;
  fullName: string;
  type: string;
  userID: string;
  birthday: string;
  birthType: string;
  positionName: string;
  level: string;
  position: string;
}

/**
 * Naver Works API를 사용하여 모든 사용자 목록을 조회하는 함수
 * 기존 worksAPI.js의 usersList 패턴 유지
 */
export async function usersList(): Promise<NaverWorksUser[]> {
  const getURL = `https://www.worksapis.com/v1.0/users?domainid=${config.naverWorks.domainId}`;
  const accessToken = await getAccessToken();

  try {
    const response = await axios.get(getURL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const json = response.data;

    // API 응답에서 필요한 사용자 정보만 추출하여 가공
    const list: NaverWorksUser[] = json.users.map((js: any) => {
      return {
        email: js.email,
        fullName: js.userName.lastName + js.userName.firstName,
        type: js.employmentTypeName,
        userID: js.userId,
        birthday: js.birthday,
        birthType: js.birthdayCalendarType,
        positionName: js.organizations?.[0]?.orgUnits?.[0]?.orgUnitName || '',
        level: js.organizations?.[0]?.levelName || '',
        position: js.organizations?.[0]?.orgUnits?.[0]?.positionName || '',
      };
    });

    return list;
  } catch (error) {
    logger.error('Failed to fetch users list:', error);
    throw error;
  }
}

/**
 * 특정 사용자의 정보를 조회하는 함수
 * 기존 worksAPI.js의 userInfo 패턴 유지
 */
export async function userInfo(userId: string): Promise<NaverWorksUser> {
  const userList = await usersList();
  const user = userList.find((u) => u.userID === userId);

  if (!user) {
    throw new Error(`사용자 ID ${userId}를 찾을 수 없습니다.`);
  }

  return user;
}
