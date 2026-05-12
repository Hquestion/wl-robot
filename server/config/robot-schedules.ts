import type { RobotScheduleTask } from '../utils/robot-schedule'

const robotSchedules: RobotScheduleTask[] = [
  // Example:
  {
    id: '买丹',
    enabled: true,
    roomId: '57366115191@chatroom',
    message: '记得买复活丹',
    mentionAll: true,
    schedule: {
      type: 'weekly',
      time: '00:13',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    },
  },
]

export default robotSchedules
