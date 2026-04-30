import crypto from 'crypto';
import { PlaceColorIdMap } from '../../types/calendar.type';
import { loadPlaceColorIdMapFromRedis } from '../../utils/cache';
import { ENV } from '../../../../env';
import { FatalError } from '../../utils/appError';

// place에 따른 캘린더 이벤트의 colorId를 매칭해주는 도구
export class PlaceColorIdMapper {
  private static map: PlaceColorIdMap | null = null;

  // 최초 인스턴스 등록을 위한 static 함수
  static async load() {
    if (!this.map) {
      // Redis에서 맵핑을 위한 맵 로드
      const map = await loadPlaceColorIdMapFromRedis();
      // Redis 로드 실패 시 빈 오브젝트 반환
      this.map = map === 'No Cache' ? {} : map;
    }
  }

  static getColorId(placeName: string) {
    if (this.map === null) {
      throw new FatalError(
        'COLOR_ID_MAP_NOT_FOUND',
        `colorId 맵을 찾을 수 없습니다. ${this.name}의 로딩이 필요합니다.`,
      );
    }
    // 맵 정상적으로 불러왔을 경우 컬러id 매칭 및 출력
    if (Object.keys(this.map).length !== 0) {
      // placeName의 해시 생성
      const salt = ENV.GOOGLE_CALENDAR_PLACE_HASH_SECRET;
      const placeHash = crypto.createHmac('sha256', salt).update(placeName).digest('hex');

      return (this.map?.[placeHash] ?? 10).toString(); // 매퍼 사용, 디폴트 10
    }
    // 대안: placeName 길이에 따른 1 ~ 11 값으로 지정
    return (Math.floor(placeName.length % 11) + 1).toString();
  }
}
