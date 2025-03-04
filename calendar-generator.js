const ical = require('ical-generator');
const fs = require('fs');
const path = require('path');
const NeisClient = require('./neis-client');

class CalendarGenerator {

  constructor(schoolName = '학교 일정') {
    this.schoolName = schoolName;
    this.calendar = ical.default({
      name: this.schoolName,
      timezone: 'Asia/Seoul',
      ttl: 60 * 60
    });
    
    // 토요휴업일만 제외
    this.filteredEvents = ['토요휴업일'];
    
    // 연속 이벤트 추적용
    this.currentEvents = new Map(); // 현재 진행 중인 이벤트들 추적
  }

  addScheduleEvents(scheduleItems) {
    if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) {
      console.warn('일정 데이터가 없습니다.');
      return;
    }
    
    console.log(`${scheduleItems.length}개의 일정 처리 중...`);
    
    // 날짜순으로 정렬
    scheduleItems.sort((a, b) => a.AA_YMD.localeCompare(b.AA_YMD));
    
    for (const item of scheduleItems) { 

      // 토요휴업일이거나 공휴일(DESCRIPTION에 '공휴일' 포함) 제외
      if (this.filteredEvents.includes(item.EVENT_NM) || 
          ( item.SBTR_DD_SC_NM.includes('공휴일'))) {
        continue;
      }
      
      const currentDate = this.parseDate(item.AA_YMD);
      
      // CONTENT와 DESCRIPTION 합치기
      let description = item.CONTENT || '';
      if (item.DESCRIPTION) {
        description = description ? `${description}\n${item.DESCRIPTION}` : item.DESCRIPTION;
      }
      
      // 연속된 이벤트 처리
    // if (this.currentEvents.has(item.EVENT_NM)) {
    //   // 기존 이벤트가 있는 경우
    //   const event = this.currentEvents.get(item.EVENT_NM);
    //   const lastDate = new Date(event.end);
    //   lastDate.setDate(lastDate.getDate() - 1); // end는 다음 날짜이므로 1일 뺌
      
    //   // 방학 관련 이벤트인지 확인 (여름방학, 겨울방학 등)
    //   const isVacationEvent = item.EVENT_NM.includes('방학');
      
    //   if (this.isConsecutiveDate(lastDate, currentDate) || isVacationEvent) {
    //     // 연속된 날짜인 경우 또는 방학 이벤트인 경우 종료일 업데이트
    //     event.end = new Date(currentDate);
    //     event.end.setDate(event.end.getDate() + 1);
        
    //     // 설명 업데이트 (필요한 경우)
    //     if (description && !event.description().includes(description)) {
    //       event.description(event.description() + '\n' + description);
    //     }
        
    //     continue;
    //   } else {
    //     // 연속되지 않은 경우 새 이벤트 시작
    //     this.currentEvents.delete(item.EVENT_NM);
    //   }
    // }
      // 새로운 이벤트 생성
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + 1);
      
      const newEvent = this.calendar.createEvent({
        start: currentDate,
        end: endDate,
        allDay: true,
        summary: item.EVENT_NM+"("+item.THREE_GRADE_EVENT_YN+")",
        description: description,
        location: this.schoolName
      });
      
      this.currentEvents.set(item.EVENT_NM+"("+item.THREE_GRADE_EVENT_YN+")", newEvent);
    }
    
    this.currentEvents.clear();
    console.log(`일정 추가 완료`);
  }
  
  isConsecutiveDate(date1, date2) {
    const nextDay = new Date(date1);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.getTime() === date2.getTime();
  }
  
  parseDate(dateString) {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    return new Date(year, month, day);
  }
  
  saveToFile(filePath = 'calendar.ics') {
    try {
      fs.writeFileSync(filePath, this.calendar.toString());
      console.log(`캘린더가 ${filePath}에 저장되었습니다.`);
      return true;
    } catch (error) {
      console.error('캘린더 저장 실패:', error);
      return false;
    }
  }
}

// 메인 실행 코드
if (require.main === module) {
  const generator = new CalendarGenerator('학교 일정');
  
  (async () => {
    try {
      const neisClient = new NeisClient();
      const scheduleData = await neisClient.getSchoolSchedule(
        "20250301",
        "20260228"
      );
      
      if (!scheduleData || !scheduleData.length) {
        console.error('학사일정 데이터를 가져오지 못했습니다.');
        process.exit(1);
      }
      
      generator.addScheduleEvents(scheduleData);
      generator.saveToFile('calendar.ics');
      
    } catch (error) {
      console.error('오류 발생:', error);
      process.exit(1);
    }
  })();
}

module.exports = CalendarGenerator;


