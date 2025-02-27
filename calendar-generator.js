const ical = require('ical-generator');
const fs = require('fs');
const path = require('path');
const NeisClient = require('./neis-client');

class CalendarGenerator {
  constructor(schoolName = '학교 일정') {
    this.schoolName = schoolName;
    
    // ical-generator 라이브러리 초기화 수정
    this.calendar = ical.default({
      name: this.schoolName,
      timezone: 'Asia/Seoul', 
      ttl: 60 * 60 // 1시간마다 업데이트
    });
    
    // 일정을 날짜별로 그룹화하기 위한 객체
    this.eventsByDate = {};
    
    // 반복 이벤트 패턴 (예: 토요휴업일, 방학 등)
    this.recurringEvents = {};
    
    // 필터링할 이벤트명 목록
    this.filteredEvents = ['토요휴업일', '일요휴업일'];
  }

  /**
   * 날짜별로 이벤트를 그룹화
   */
  addScheduleEvents(scheduleItems) {
    if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) {
      console.warn('No schedule items to add to calendar');
      return;
    }
    
    console.log(`Processing ${scheduleItems.length} schedule items...`);
    
    // 날짜별로 이벤트 그룹화 (필터링된 이벤트 제외)
    for (const item of scheduleItems) {
      // 필터링된 이벤트는 건너뛰기
      if (this.filteredEvents.includes(item.EVENT_NM)) {
        console.log(`Filtering out event: ${item.EVENT_NM} on ${item.AA_YMD}`);
        continue;
      }
      
      const dateString = item.AA_YMD;
      if (!this.eventsByDate[dateString]) {
        this.eventsByDate[dateString] = [];
      }
      this.eventsByDate[dateString].push(item);
      
      // 반복 패턴 감지 (예: 여름방학)
      if (item.EVENT_NM === '여름방학') {
        if (!this.recurringEvents['여름방학']) {
          this.recurringEvents['여름방학'] = {
            summary: '여름방학',
            dates: []
          };
        }
        this.recurringEvents['여름방학'].dates.push(dateString);
      }
    }
    
    // 날짜별로 그룹화된 이벤트를 캘린더에 추가
    this.processGroupedEvents();
    
    // 반복 이벤트 생성
    this.createRecurringEvents();
    
    console.log(`Processed events for ${Object.keys(this.eventsByDate).length} unique dates`);
  }
  
  /**
   * 날짜별로 그룹화된 이벤트 처리
   */
  processGroupedEvents() {
    let eventCount = 0;
    
    for (const dateString in this.eventsByDate) {
      const events = this.eventsByDate[dateString];
      
      // 같은 날짜에 여러 이벤트가 있는 경우 처리
      if (events.length > 1) {
        // 특별한 처리가 필요한지 확인 (동일 이벤트 타입 등)
        const isAllSameType = events.every(e => this.getEventCategory(e) === this.getEventCategory(events[0]));
        
        // 카테고리가 모두 같으면 하나의 이벤트로 합치기
        if (isAllSameType) {
          this.createCombinedEvent(dateString, events);
          eventCount++;
        } else {
          // 다른 카테고리면 별도 이벤트로 생성
          for (const event of events) {
            // 반복 이벤트에 포함된 경우 스킵
            if (this.isPartOfRecurringEvent(event)) continue;
            
            this.createSingleEvent(dateString, event);
            eventCount++;
          }
        }
      } else if (events.length === 1) {
        // 반복 이벤트에 포함된 경우 스킵
        if (this.isPartOfRecurringEvent(events[0])) continue;
        
        this.createSingleEvent(dateString, events[0]);
        eventCount++;
      }
    }
    
    console.log(`Created ${eventCount} individual events`);
  }
  
  /**
   * 한 날짜에 여러 이벤트가 있을 때 하나의 이벤트로 합침
   */
  createCombinedEvent(dateString, events) {
    try {
      const year = parseInt(dateString.substring(0, 4));
      const month = parseInt(dateString.substring(4, 6)) - 1; // JS 월은 0부터 시작
      const day = parseInt(dateString.substring(6, 8));
      
      const eventDate = new Date(year, month, day);
      if (isNaN(eventDate.getTime())) {
        console.error(`Invalid date for combined event: ${dateString}`);
        return;
      }
      
      const eventNames = events.map(e => e.EVENT_NM);
      const uniqueNames = [...new Set(eventNames)];
      
      const summary = uniqueNames.join(', ');
      const description = events.map(e => `${e.EVENT_NM}${e.CONTENT ? `: ${e.CONTENT}` : ''}`).join('\n');
      
      this.calendar.createEvent({
        start: eventDate,
        allDay: true,
        summary: summary,
        description: description,
        location: this.schoolName,
        uid: `neis-${dateString}-combined`
      });
    } catch (error) {
      console.error(`Error creating combined event for ${dateString}:`, error);
    }
  }
  
  /**
   * 단일 이벤트 생성
   */
  createSingleEvent(dateString, event) {
    try {
      const year = parseInt(dateString.substring(0, 4));
      const month = parseInt(dateString.substring(4, 6)) - 1;
      const day = parseInt(dateString.substring(6, 8));
      
      const eventDate = new Date(year, month, day);
      if (isNaN(eventDate.getTime())) {
        console.error(`Invalid date for event ${event.EVENT_NM}: ${dateString}`);
        return;
      }
      
      this.calendar.createEvent({
        start: eventDate,
        allDay: true,
        summary: event.EVENT_NM,
        description: event.CONTENT || '',
        location: this.schoolName,
      });
    } catch (error) {
      console.error(`Error creating event ${event.EVENT_NM} for ${dateString}:`, error);
    }
  }
  
  /**
   * 반복 이벤트 처리
   */
  createRecurringEvents() {
    // 방학 기간 처리
    if (this.recurringEvents['여름방학'] && this.recurringEvents['여름방학'].dates.length >= 3) {
      try {
        // 날짜 정렬
        const dates = this.recurringEvents['여름방학'].dates.sort();
        
        // 시작 날짜
        const startDateStr = dates[0];
        const startYear = parseInt(startDateStr.substring(0, 4));
        const startMonth = parseInt(startDateStr.substring(4, 6)) - 1;
        const startDay = parseInt(startDateStr.substring(6, 8));
        
        // 종료 날짜
        const endDateStr = dates[dates.length - 1];
        const endYear = parseInt(endDateStr.substring(0, 4));
        const endMonth = parseInt(endDateStr.substring(4, 6)) - 1;
        const endDay = parseInt(endDateStr.substring(6, 8));
        
        const startDate = new Date(startYear, startMonth, startDay);
        const endDate = new Date(endYear, endMonth, endDay);
        endDate.setDate(endDate.getDate() + 1); // 종료일 다음 날짜 (iCal 표준)
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.error(`Invalid date range for summer vacation: ${startDateStr} to ${endDateStr}`);
          return;
        }
        
        this.calendar.createEvent({
          start: startDate,
          end: endDate,
          allDay: true,
          summary: '여름방학',
          description: '여름방학 기간',
          location: this.schoolName,
          uid: `neis-${startYear}-summer-vacation`
        });
        
        console.log(`Created summer vacation event from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      } catch (error) {
        console.error('Error creating recurring summer vacation event:', error);
      }
    }
  }
  
  /**
   * 해당 이벤트가 반복 이벤트에 포함되는지 확인
   */
  isPartOfRecurringEvent(event) {
    if (event.EVENT_NM === '여름방학' && this.recurringEvents['여름방학'] && 
        this.recurringEvents['여름방학'].dates.includes(event.AA_YMD)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 이벤트 카테고리 결정
   */
  getEventCategory(event) {
    const name = event.EVENT_NM;
    
    if (name.includes('휴업일') || name.includes('공휴일') || name.includes('휴일') || 
        name.includes('개교기념일') || name === '현충일' || name === '3·1절' || 
        name === '어린이날' || name === '부처님오신날') {
      return '휴일';
    }
    
    if (name.includes('방학') || name === '개학식' || name === '입학식' || name === '방학식') {
      return '방학/입학';
    }
    
    if (name.includes('고사') || name.includes('평가')) {
      return '시험';
    }
    
    if (name.includes('교육') || name.includes('설명회')) {
      return '교육';
    }
    
    if (name.includes('활동') || name.includes('체험')) {
      return '활동';
    }
    
    return '일반';
  }
  
  generateCalendar() {
    try {
      // 최종 캘린더 생성 전에 유효성 검사
      const eventCount = this.calendar.events().length;
      console.log(`Finalizing calendar with ${eventCount} events`);
      
      if (eventCount === 0) {
        console.warn('Warning: No events in calendar');
      }
      
      return this.calendar.toString();
    } catch (error) {
      console.error('Error generating calendar string:', error);
      return 'ERROR: Failed to generate calendar';
    }
  }
  
  /**
   * 생성된 캘린더를 파일로 저장
   * @param {string} filePath - 저장할 파일 경로 (기본값: 'calendar.ics')
   * @returns {boolean} - 저장 성공 여부
   */
  saveToFile(filePath = 'calendar.ics') {
    try {
      const calendarData = this.generateCalendar();
      if (calendarData.startsWith('ERROR:')) {
        console.error('Failed to generate calendar data');
        return false;
      }
      
      // 디렉토리 경로 확인 및 생성
      const directory = path.dirname(filePath);
      if (directory !== '.' && !fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      
      fs.writeFileSync(filePath, calendarData, 'utf8');
      console.log(`Calendar saved to ${filePath}`);
      return true;
    } catch (error) {
      console.error(`Error saving calendar to file ${filePath}:`, error);
      return false;
    }
  }
}

// 스크립트가 직접 실행될 때의 처리
if (require.main === module) {
  const schoolName = process.env.SCHOOL_NAME || '학교 일정';
  const calendarGenerator = new CalendarGenerator(schoolName);
  
  // 비동기 함수로 실행
  (async () => {
    try {
      // 필요한 환경 변수 확인
      const startDate = "20250301";
      const endDate = "20260228";
      

      // NeisClient 초기화 및 학사일정 데이터 가져오기
      const neisClient = new NeisClient();
      console.log('학사일정 데이터를 가져오는 중...');
      
      const scheduleData = await neisClient.getSchoolSchedule(
        startDate,
        endDate
      );
      
      if (!scheduleData || !scheduleData.length) {
        console.error('학사일정 데이터를 가져오지 못했습니다.');
        process.exit(1);
      }
      
      console.log(`${scheduleData.length}개의 학사일정 항목을 가져왔습니다.`);
      
      // 캘린더에 일정 추가
      calendarGenerator.addScheduleEvents(scheduleData);
      
      // 일정이 추가되었는지 확인
      const eventCount = calendarGenerator.calendar.events().length;
      console.log(`캘린더에 추가된 이벤트 수: ${eventCount}`);
      
      if (eventCount === 0) {
        console.warn('경고: 캘린더에 추가된 이벤트가 없습니다. 필터링 설정이나 데이터를 확인해주세요.');
      }
      
      // 파일 저장
      const filePath = process.env.CALENDAR_FILE_PATH || 'calendar.ics';
      const saveResult = calendarGenerator.saveToFile(filePath);
      
      if (saveResult) {
        console.log(`캘린더가 성공적으로 생성되었습니다: ${filePath}`);
      } else {
        console.error('캘린더 파일 생성에 실패했습니다.');
        process.exit(1);
      }
    } catch (error) {
      console.error('캘린더 생성 중 오류가 발생했습니다:', error);
      process.exit(1);
    }
  })();
}

module.exports = CalendarGenerator;


