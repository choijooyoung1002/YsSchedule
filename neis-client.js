const axios = require('axios');
require('dotenv').config();

class NeisClient {
  constructor() {
    this.baseUrl = process.env.NEIS_API_URL;
    this.key = process.env.NEIS_KEY;
    this.atptOfcdcScCode = process.env.ATPT_OFCDC_SC_CODE;
    this.sdSchulCode = process.env.SD_SCHUL_CODE;
    
    // 필수 환경 변수 검증
    if (!this.baseUrl || !this.key || !this.atptOfcdcScCode || !this.sdSchulCode) {
      console.error('Missing required environment variables for NEIS API');
      console.error('Required: NEIS_API_URL, NEIS_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE');
      console.error('Current values:', {
        NEIS_API_URL: this.baseUrl ? '[설정됨]' : '[없음]',
        NEIS_KEY: this.key ? '[설정됨]' : '[없음]',
        ATPT_OFCDC_SC_CODE: this.atptOfcdcScCode ? '[설정됨]' : '[없음]',
        SD_SCHUL_CODE: this.sdSchulCode ? '[설정됨]' : '[없음]'
      });
    }
  }

  async getSchoolSchedule(startDate, endDate) {
    try {
      console.log(`Fetching school schedule from NEIS API...`);
      console.log(`Parameters: ATPT_OFCDC_SC_CODE=${this.atptOfcdcScCode}, SD_SCHUL_CODE=${this.sdSchulCode}`);
      console.log(`Date Range: ${startDate} ~ ${endDate}`);
      
      // 필수 파라미터 검증
      if (!this.baseUrl || !this.key || !this.atptOfcdcScCode || !this.sdSchulCode) {
        throw new Error('Missing required NEIS API configuration');
      }
      
      if (!startDate || !endDate || startDate.length !== 8 || endDate.length !== 8) {
        throw new Error(`Invalid date format: startDate=${startDate}, endDate=${endDate}. Expected format: YYYYMMDD`);
      }
      
      // API 요청 전송
      const response = await axios.get(`${this.baseUrl}/SchoolSchedule`, {
        params: {
          KEY: this.key,
          Type: 'json',
          ATPT_OFCDC_SC_CODE: this.atptOfcdcScCode,
          SD_SCHUL_CODE: this.sdSchulCode,
          TI_FROM_YMD: startDate, 
          TI_TO_YMD: endDate, 
        },
        timeout: 10000 // 타임아웃 10초 설정
      });
      
      // API 응답 구조 확인용 로깅
      console.log('API Response Status:', response.status);
      console.log('API Response Data Keys:', Object.keys(response.data));
      
      // NEIS API 응답 구조에 맞게 처리
      if (response.data?.SchoolSchedule && response.data.SchoolSchedule.length > 0) {
        // 결과 코드 확인
        const resultCode = response.data.SchoolSchedule[0].head[1].RESULT.CODE;
        console.log('Result code:', resultCode);
        
        if (resultCode === 'INFO-000') {
          // 정상 응답
          const scheduleItems = response.data.SchoolSchedule[1].row;
          console.log(`Successfully retrieved ${scheduleItems.length} schedule items`);
          return scheduleItems;
        } else if (resultCode === 'INFO-200') {
          // 데이터가 없는 경우 (정상 응답)
          console.warn(`No school schedule data available for the period ${startDate} ~ ${endDate}`);
          return [];
        } else {
          // API 오류 응답
          console.error('Error fetching school schedule:', response.data.SchoolSchedule[0].head[1].RESULT.MESSAGE);
          return [];
        }
      } else if (response.data?.RESULT?.CODE) {
        // 다른 응답 구조 처리
        console.error('Error in API response:', response.data.RESULT.MESSAGE);
        return [];
      } else {
        // 예상치 못한 응답 구조
        console.error('Unexpected API response structure:', JSON.stringify(response.data).substring(0, 500) + '...');
        return [];
      }
    } catch (error) {
      if (error.response) {
        // 서버에서 응답이 왔지만 2xx 범위가 아닌 상태 코드
        console.error(`API Error - Status: ${error.response.status}, Message:`, error.response.data);
      } else if (error.request) {
        // 요청은 전송되었지만 응답을 받지 못함
        console.error('No response from API server:', error.message);
      } else {
        // 요청 설정 중 오류 발생
        console.error('Error making NEIS API request:', error.message);
      }
      
      if (error.config) {
        console.error('Request URL:', error.config.url);
        console.error('Request Params:', error.config.params);
      }
      
      return [];
    }
  }
}

module.exports = NeisClient;