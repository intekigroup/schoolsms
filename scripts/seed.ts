import { PrismaClient } from '@prisma/client'
import { schoolTodayStart } from '../lib/school-time'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. Create demo school
  const school = await prisma.school.upsert({
    where: { id: 'school-kilimanjaro' },
    update: {},
    create: {
      id: 'school-kilimanjaro',
      name: 'Kilimanjaro Academy',
      motto: 'Excellence in Education',
      address: 'Plot 42, Nyerere Road',
      city: 'Arusha',
      region: 'Arusha',
      phone: '+255 272 123 456',
      email: 'info@kilimanjaro-academy.tz',
      schoolLevel: ['PRIMARY', 'O_LEVEL', 'A_LEVEL'],
    },
  })

  // 2. Create subscription
  await prisma.schoolSubscription.upsert({
    where: { schoolId: school.id },
    update: {},
    create: {
      plan: 'PREMIUM',
      status: 'ACTIVE',
      maxStudents: 500,
      maxStaff: 50,
      schoolId: school.id,
    },
  })

  // (The template's hidden "abacus" admin account was removed on 2026-09-11.)

  // 4. Create demo school admin for the user
  const demoAdminHash = await bcrypt.hash('admin123', 12)
  await prisma.user.upsert({
    where: { email: 'admin@kilimanjaro.tz' },
    update: {},
    create: {
      email: 'admin@kilimanjaro.tz',
      name: 'Dr. Joseph Mwalimu',
      hashedPassword: demoAdminHash,
      emailVerified: new Date(),
      role: 'SCHOOL_ADMIN',
      schoolId: school.id,
    },
  })

  // 5. Create super admin
  const superHash = await bcrypt.hash('super123', 12)
  await prisma.user.upsert({
    where: { email: 'super@shulesms.tz' },
    update: {},
    create: {
      email: 'super@shulesms.tz',
      name: 'Platform Admin',
      hashedPassword: superHash,
      emailVerified: new Date(),
      role: 'SUPER_ADMIN',
    },
  })

  // 6. Create academic year & terms
  const ay = await prisma.academicYear.upsert({
    where: { id: 'ay-2026' },
    update: {},
    create: {
      id: 'ay-2026',
      name: '2026',
      startDate: new Date('2026-01-06'),
      endDate: new Date('2026-11-27'),
      isCurrent: true,
      schoolId: school.id,
    },
  })

  const terms = [
    { id: 'term-1-2026', name: 'Term 1', start: '2026-01-06', end: '2026-03-27', current: false },
    { id: 'term-2-2026', name: 'Term 2', start: '2026-05-04', end: '2026-08-14', current: true },
    { id: 'term-3-2026', name: 'Term 3', start: '2026-09-07', end: '2026-11-27', current: false },
  ]
  for (const t of terms) {
    await prisma.term.upsert({
      where: { id: t.id },
      update: {},
      create: { id: t.id, name: t.name, startDate: new Date(t.start), endDate: new Date(t.end), isCurrent: t.current, academicYearId: ay.id },
    })
  }

  // 7. Create subjects
  const subjectNames = [
    { name: 'Mathematics', code: 'MATH' }, { name: 'English', code: 'ENG' },
    { name: 'Kiswahili', code: 'KIS' }, { name: 'Science', code: 'SCI' },
    { name: 'History', code: 'HIST' }, { name: 'Geography', code: 'GEO' },
    { name: 'Civics', code: 'CIV' }, { name: 'Biology', code: 'BIO' },
    { name: 'Chemistry', code: 'CHEM' }, { name: 'Physics', code: 'PHY' },
  ]
  const subjects: any[] = []
  for (const s of subjectNames) {
    const sub = await prisma.subject.upsert({
      where: { id: `sub-${s.code}` },
      update: {},
      create: { id: `sub-${s.code}`, name: s.name, code: s.code, schoolId: school.id },
    })
    subjects.push(sub)
  }

  // 8. Create classes
  const classData = [
    { id: 'cls-std5', name: 'Std 5', level: 'PRIMARY' as const },
    { id: 'cls-std6', name: 'Std 6', level: 'PRIMARY' as const },
    { id: 'cls-std7', name: 'Std 7', level: 'PRIMARY' as const },
    { id: 'cls-form1a', name: 'Form 1A', level: 'O_LEVEL' as const },
    { id: 'cls-form1b', name: 'Form 1B', level: 'O_LEVEL' as const },
    { id: 'cls-form2a', name: 'Form 2A', level: 'O_LEVEL' as const },
    { id: 'cls-form3a', name: 'Form 3A', level: 'O_LEVEL' as const },
    { id: 'cls-form4a', name: 'Form 4A', level: 'O_LEVEL' as const },
    { id: 'cls-form5a', name: 'Form 5 Arts', level: 'A_LEVEL' as const },
    { id: 'cls-form6a', name: 'Form 6 Science', level: 'A_LEVEL' as const },
  ]
  const classes: any[] = []
  for (const c of classData) {
    const cls = await prisma.class.upsert({
      where: { id: c.id },
      update: {},
      create: { id: c.id, name: c.name, level: c.level, capacity: 45, schoolId: school.id },
    })
    classes.push(cls)
    // Link subjects to class
    for (const sub of subjects.slice(0, 7)) {
      await prisma.classSubject.upsert({
        where: { classId_subjectId: { classId: cls.id, subjectId: sub.id } },
        update: {},
        create: { classId: cls.id, subjectId: sub.id },
      })
    }
  }

  // 9. Create staff / teachers
  const teacherData = [
    { id: 'staff-1', fn: 'Amina', ln: 'Hassan', g: 'FEMALE' as const, emp: 'TCH-001', role: 'Teacher', qual: 'B.Ed Mathematics', salary: 850000 },
    { id: 'staff-2', fn: 'John', ln: 'Kimaro', g: 'MALE' as const, emp: 'TCH-002', role: 'Teacher', qual: 'B.Ed English', salary: 800000 },
    { id: 'staff-3', fn: 'Grace', ln: 'Moshi', g: 'FEMALE' as const, emp: 'TCH-003', role: 'Teacher', qual: 'B.Sc Biology', salary: 900000 },
    { id: 'staff-4', fn: 'Peter', ln: 'Mwanga', g: 'MALE' as const, emp: 'TCH-004', role: 'Teacher', qual: 'B.A Kiswahili', salary: 780000 },
    { id: 'staff-5', fn: 'Sarah', ln: 'Njau', g: 'FEMALE' as const, emp: 'TCH-005', role: 'Teacher', qual: 'B.Sc Chemistry', salary: 870000 },
    { id: 'staff-6', fn: 'David', ln: 'Mtei', g: 'MALE' as const, emp: 'TCH-006', role: 'Teacher', qual: 'B.Ed History', salary: 800000 },
    { id: 'staff-7', fn: 'Rose', ln: 'Mbaga', g: 'FEMALE' as const, emp: 'ACC-001', role: 'Accountant', qual: 'B.Com Accounting', salary: 750000 },
    { id: 'staff-8', fn: 'Emanuel', ln: 'Shirima', g: 'MALE' as const, emp: 'LIB-001', role: 'Librarian', qual: 'Dip. Library Science', salary: 550000 },
  ]
  for (const t of teacherData) {
    await prisma.staff.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id, firstName: t.fn, lastName: t.ln, gender: t.g,
        employeeNo: t.emp, role: t.role, qualification: t.qual,
        salary: t.salary, schoolId: school.id,
      },
    })
  }

  // Assign class teachers
  for (let i = 0; i < Math.min(classes.length, 6); i++) {
    await prisma.class.update({
      where: { id: classes[i].id },
      data: { classTeacherId: teacherData[i].id },
    }).catch(() => {})
  }

  // 10. Create students
  const firstNames = ['Asha', 'Baraka', 'Chiku', 'Daudi', 'Esther', 'Fadhili', 'Gladys', 'Hamisi', 'Imani', 'Juma', 'Khadija', 'Lulu', 'Mwanaidi', 'Nassor', 'Omega', 'Paul', 'Queen', 'Rashid', 'Salma', 'Tumaini']
  const lastNames = ['Mwamba', 'Kilonzo', 'Nkya', 'Msafiri', 'Kimaro', 'Mero', 'Shirima', 'Mollel', 'Minja', 'Temba', 'Swai', 'Massawe', 'Pallangyo', 'Urassa', 'Kileo', 'Mmari', 'Lyimo', 'Maro', 'Tarimo', 'Shayo']

  let studentIdx = 0
  for (const cls of classes) {
    // Deterministic 8-12 per class: a random count with an upsert keyed on a
    // sequential admissionNo made re-seeding non-idempotent — each run drew a
    // different total and grew the table instead of converging.
    const count = 8 + (classes.indexOf(cls) % 5)
    for (let i = 0; i < count; i++) {
      studentIdx++
      const fn = firstNames[studentIdx % firstNames.length]
      const ln = lastNames[(studentIdx + 3) % lastNames.length]
      const g = studentIdx % 2 === 0 ? 'MALE' : 'FEMALE'
      const admNo = `KA-2026-${String(studentIdx).padStart(3, '0')}`
      // Derived from the index, so a re-seed reproduces the same student.
      const dob = new Date(2010 + (studentIdx % 6), studentIdx % 12, 1 + (studentIdx % 28))

      await prisma.student.upsert({
        where: { admissionNo_schoolId: { admissionNo: admNo, schoolId: school.id } },
        update: {},
        create: {
          firstName: fn, lastName: ln, gender: g as any,
          dateOfBirth: dob, admissionNo: admNo,
          classId: cls.id, schoolId: school.id,
        },
      })
    }
  }

  // 10b. Create guardians and link to students
  const allStudentsForGuardians = await prisma.student.findMany({
    where: { schoolId: school.id },
    orderBy: { admissionNo: 'asc' },
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
  })
  const parentFirstNames = ['John', 'Mary', 'Peter', 'Grace', 'David', 'Neema', 'Emmanuel', 'Joyce', 'Michael', 'Rehema', 'Joseph', 'Anna', 'Samuel', 'Happy', 'Daniel', 'Upendo']
  for (let i = 0; i < allStudentsForGuardians.length; i++) {
    const st = allStudentsForGuardians[i]
    const isFather = i % 2 === 0
    const gid = `guard-${st.admissionNo}`
    const phone = `+2557${String(60000000 + (i * 137) % 39999999).padStart(8, '0')}`
    await prisma.guardian.upsert({
      where: { id: gid },
      update: {},
      create: {
        id: gid,
        firstName: parentFirstNames[i % parentFirstNames.length],
        lastName: st.lastName,
        phone,
        email: i % 3 === 0 ? `${parentFirstNames[i % parentFirstNames.length].toLowerCase()}.${st.lastName.toLowerCase()}@example.com` : null,
        relationship: isFather ? 'Father' : 'Mother',
        occupation: isFather ? 'Businessman' : 'Teacher',
      },
    })
    await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: st.id, guardianId: gid } },
      update: {},
      create: { studentId: st.id, guardianId: gid, isPrimary: true },
    })
  }

  // 10c. Create a demo PARENT login linked to a guardian with two children
  if (allStudentsForGuardians.length >= 2) {
    const parentHash = await bcrypt.hash('parent123', 12)
    const parentUser = await prisma.user.upsert({
      where: { email: 'parent@kilimanjaro.tz' },
      update: { schoolId: school.id, role: 'PARENT' },
      create: {
        email: 'parent@kilimanjaro.tz',
        name: 'Mr. John Mwamba',
        hashedPassword: parentHash,
        emailVerified: new Date(),
        role: 'PARENT',
        schoolId: school.id,
      },
    })
    const demoGuardianId = 'guard-demo-parent'
    await prisma.guardian.upsert({
      where: { id: demoGuardianId },
      update: { userId: parentUser.id },
      create: {
        id: demoGuardianId,
        firstName: 'John',
        lastName: 'Mwamba',
        phone: '+255712000111',
        email: 'parent@kilimanjaro.tz',
        relationship: 'Father',
        occupation: 'Businessman',
        userId: parentUser.id,
      },
    })
    for (const st of allStudentsForGuardians.slice(0, 2)) {
      await prisma.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: st.id, guardianId: demoGuardianId } },
        update: {},
        create: { studentId: st.id, guardianId: demoGuardianId, isPrimary: false },
      })
    }
  }

  // 11. Create fee structures
  const feeTypes = [
    { id: 'fee-tuition', name: 'Tuition Fee', amount: 450000 },
    { id: 'fee-exam', name: 'Exam Fee', amount: 50000 },
    { id: 'fee-uniform', name: 'Uniform Fee', amount: 85000 },
    { id: 'fee-transport', name: 'Transport Fee', amount: 120000 },
    { id: 'fee-meals', name: 'Meals Fee', amount: 200000 },
    { id: 'fee-boarding', name: 'Boarding Fee', amount: 350000 },
  ]
  for (const f of feeTypes) {
    await prisma.feeStructure.upsert({
      where: { id: f.id },
      update: {},
      create: { id: f.id, name: f.name, amount: f.amount, schoolId: school.id },
    })
  }

  // 12. Create some payments
  const allStudents = await prisma.student.findMany({ where: { schoolId: school.id }, take: 30 })
  const payMethods = ['CASH', 'MPESA', 'TIGOPESA', 'BANK_TRANSFER', 'AIRTEL_MONEY'] as const
  for (let i = 0; i < Math.min(allStudents.length, 25); i++) {
    const st = allStudents[i]
    const feeId = feeTypes[i % feeTypes.length].id
    const method = payMethods[i % payMethods.length]
    await prisma.feePayment.upsert({
      where: { id: `pay-${st.id}-${feeId}` },
      update: {},
      create: {
        id: `pay-${st.id}-${feeId}`,
        amount: feeTypes[i % feeTypes.length].amount,
        paymentMethod: method,
        paymentStatus: 'COMPLETED',
        // Derived from the student, so re-seeding cannot mint a duplicate.
        receiptNo: `RCT-${st.admissionNo}`,
        studentId: st.id,
        schoolId: st.schoolId,
        feeStructureId: feeId,
        paidAt: new Date(2026, 4 + Math.floor(i / 10), 1 + (i % 28)),
      },
    })
  }

  // 13. Create attendance for today
  // Same civil-day convention the dashboard queries with.
  const today = schoolTodayStart()
  const studentsForAttendance = await prisma.student.findMany({ where: { schoolId: school.id, status: 'ACTIVE' }, take: 50 })
  // Deterministic spread (~86% present) so a re-seed reproduces the same data.
  for (const [attIdx, st] of studentsForAttendance.entries()) {
    const status = attIdx % 7 === 3 ? 'ABSENT' : attIdx % 11 === 5 ? 'LATE' : 'PRESENT'
    await prisma.attendance.upsert({
      where: { studentId_date: { studentId: st.id, date: today } },
      update: { status: status as any },
      create: {
        studentId: st.id,
        classId: st.classId ?? classes[0].id,
        date: today,
        status: status as any,
      },
    })
  }

  // 14. Create exams and some results
  const examData = [
    { id: 'exam-cat1-math', name: 'CAT 1 - Mathematics', type: 'CAT' as const, subIdx: 0, clsIdx: 3 },
    { id: 'exam-mid-eng', name: 'Mid-Term - English', type: 'MIDTERM' as const, subIdx: 1, clsIdx: 3 },
    { id: 'exam-end-sci', name: 'End of Term - Science', type: 'END_OF_TERM' as const, subIdx: 3, clsIdx: 0 },
    { id: 'exam-mock-bio', name: 'Mock - Biology', type: 'MOCK' as const, subIdx: 7, clsIdx: 7 },
  ]
  for (const e of examData) {
    const exam = await prisma.exam.upsert({
      where: { id: e.id },
      update: { status: 'PUBLISHED' },
      create: {
        id: e.id, name: e.name, type: e.type, totalMarks: 100, status: 'PUBLISHED',
        classId: classes[e.clsIdx % classes.length].id,
        subjectId: subjects[e.subIdx % subjects.length].id,
        academicYearId: ay.id, termId: 'term-2-2026',
      },
    })
    // Add results for students in that class
    const clsStudents = await prisma.student.findMany({ where: { classId: classes[e.clsIdx % classes.length].id }, take: 10 })
    for (const [mIdx, st] of clsStudents.entries()) {
      // Spread across the grade bands without randomness.
      const marks = 30 + ((mIdx * 17 + e.clsIdx * 7) % 65)
      const grade = marks >= 75 ? 'A' : marks >= 65 ? 'B' : marks >= 45 ? 'C' : marks >= 30 ? 'D' : 'F'
      await prisma.examResult.upsert({
        where: { studentId_examId: { studentId: st.id, examId: exam.id } },
        update: {},
        create: {
          marks, grade, studentId: st.id, examId: exam.id,
          subjectId: subjects[e.subIdx % subjects.length].id,
        },
      })
    }
  }

  // 15. Create books
  const bookData = [
    { id: 'book-1', title: 'Tanzania Secondary Mathematics', author: 'J. K. Mwamba', cat: 'Mathematics', copies: 15 },
    { id: 'book-2', title: 'English for Tanzania Schools', author: 'Oxford Press', cat: 'English', copies: 20 },
    { id: 'book-3', title: 'Kiswahili Fasaha', author: 'TUKI', cat: 'Kiswahili', copies: 18 },
    { id: 'book-4', title: 'Biology Form 1-4', author: 'Ben & Co.', cat: 'Biology', copies: 12 },
    { id: 'book-5', title: 'Things Fall Apart', author: 'Chinua Achebe', cat: 'Literature', copies: 10 },
    { id: 'book-6', title: 'History of East Africa', author: 'Longman', cat: 'History', copies: 8 },
  ]
  for (const b of bookData) {
    await prisma.book.upsert({
      where: { id: b.id },
      update: {},
      create: { id: b.id, title: b.title, author: b.author, category: b.cat, totalCopies: b.copies, available: b.copies - 2, schoolId: school.id },
    })
  }

  // 16. Create dormitories
  const dormData = [
    { id: 'dorm-boys', name: 'Kilimanjaro Boys Hostel', gender: 'MALE' as const, rooms: ['101', '102', '103', '104', '105'] },
    { id: 'dorm-girls', name: 'Meru Girls Hostel', gender: 'FEMALE' as const, rooms: ['201', '202', '203', '204', '205'] },
  ]
  for (const d of dormData) {
    await prisma.dormitory.upsert({
      where: { id: d.id },
      update: {},
      create: { id: d.id, name: d.name, gender: d.gender, capacity: d.rooms.length * 4, schoolId: school.id },
    })
    for (const rn of d.rooms) {
      await prisma.room.upsert({
        where: { id: `room-${d.id}-${rn}` },
        update: {},
        create: { id: `room-${d.id}-${rn}`, roomNumber: rn, capacity: 4, dormitoryId: d.id },
      })
    }
  }

  // 17. Create transport routes
  const routeData = [
    { id: 'route-1', name: 'Arusha CBD Route', stops: 'Clock Tower, Sokoine Rd, Njiro, School', fee: 120000 },
    { id: 'route-2', name: 'Usa River Route', stops: 'Usa River, Tengeru, Kisongo, School', fee: 150000 },
  ]
  for (const r of routeData) {
    await prisma.transportRoute.upsert({
      where: { id: r.id },
      update: {},
      create: { id: r.id, name: r.name, stops: r.stops, fee: r.fee, schoolId: school.id },
    })
  }

  await prisma.vehicle.upsert({
    where: { id: 'veh-1' },
    update: {},
    create: { id: 'veh-1', plateNumber: 'T 123 ABC', capacity: 45, driverName: 'Ally Mwanga', driverPhone: '+255 712 345 678', schoolId: school.id },
  })

  // 18. Create events
  const eventData = [
    { id: 'evt-1', title: 'Sports Day', desc: 'Annual inter-house sports competition', start: '2026-09-15', loc: 'School Grounds' },
    { id: 'evt-2', title: 'Parents Day', desc: 'Parent-teacher meeting and student showcase', start: '2026-10-10', loc: 'Main Hall' },
    { id: 'evt-3', title: 'NECTA Mock Exams', desc: 'Mock national examinations for Form 4 & 6', start: '2026-08-01', loc: 'Exam Halls' },
    { id: 'evt-4', title: 'Independence Day', desc: 'Tanzania Uhuru Day celebration', start: '2026-12-09', loc: 'School Grounds' },
  ]
  for (const e of eventData) {
    await prisma.event.upsert({
      where: { id: e.id },
      update: {},
      create: { id: e.id, title: e.title, description: e.desc, startDate: new Date(e.start), location: e.loc, schoolId: school.id },
    })
  }

  // 19. Create announcements
  await prisma.announcement.upsert({
    where: { id: 'ann-1' },
    update: {},
    create: {
      id: 'ann-1', title: 'Term 2 Fee Payment Deadline',
      content: 'All outstanding Term 2 fees must be paid by August 14, 2026. Students with unpaid fees may not sit for end-of-term exams.',
      isPublic: true, schoolId: school.id,
    },
  })

  // 19b. Seed a few in-app notifications for demo accounts
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@kilimanjaro.tz' }, select: { id: true } })
  const parentUserForNotif = await prisma.user.findUnique({ where: { email: 'parent@kilimanjaro.tz' }, select: { id: true } })
  if (adminUser) {
    const adminNotifs = [
      { id: 'notif-admin-1', title: '📢 Term 2 Fee Payment Deadline', message: 'All outstanding Term 2 fees must be paid by August 14, 2026.', isRead: false },
      { id: 'notif-admin-2', title: '💰 Fee Payment Received', message: 'A payment of TZS 450,000 for Baraka Kimaro (Tuition Fee) was recorded. Receipt RCP-2026-00001.', isRead: false },
      { id: 'notif-admin-3', title: '👋 Welcome to Shule SMS', message: 'Your school management dashboard is ready. Explore students, fees, attendance and more.', isRead: true },
    ]
    for (const n of adminNotifs) {
      await prisma.notification.upsert({
        where: { id: n.id },
        update: {},
        create: { id: n.id, title: n.title, message: n.message, isRead: n.isRead, userId: adminUser.id },
      })
    }
  }
  if (parentUserForNotif) {
    const parentNotifs = [
      { id: 'notif-parent-1', title: '📢 Term 2 Fee Payment Deadline', message: 'All outstanding Term 2 fees must be paid by August 14, 2026.', isRead: false },
      { id: 'notif-parent-2', title: '💰 Fee Payment Received', message: 'A payment of TZS 450,000 for Baraka Kimaro (Tuition Fee) was recorded. Receipt RCP-2026-00001.', isRead: false },
    ]
    for (const n of parentNotifs) {
      await prisma.notification.upsert({
        where: { id: n.id },
        update: {},
        create: { id: n.id, title: n.title, message: n.message, isRead: n.isRead, userId: parentUserForNotif.id },
      })
    }
  }

  // 20. Create timetable slots for Form 1A
  const f1aId = 'cls-form1a'
  const slotData = [
    { day: 1, start: '07:30', end: '08:15', subIdx: 0, staffIdx: 0 },
    { day: 1, start: '08:15', end: '09:00', subIdx: 1, staffIdx: 1 },
    { day: 1, start: '09:00', end: '09:45', subIdx: 2, staffIdx: 3 },
    { day: 1, start: '09:45', end: '10:30', subIdx: 3, staffIdx: 2 },
    { day: 2, start: '07:30', end: '08:15', subIdx: 4, staffIdx: 5 },
    { day: 2, start: '08:15', end: '09:00', subIdx: 5, staffIdx: 5 },
    { day: 2, start: '09:00', end: '09:45', subIdx: 0, staffIdx: 0 },
    { day: 3, start: '07:30', end: '08:15', subIdx: 1, staffIdx: 1 },
    { day: 3, start: '08:15', end: '09:00', subIdx: 6, staffIdx: 5 },
    { day: 3, start: '09:00', end: '09:45', subIdx: 3, staffIdx: 2 },
    { day: 4, start: '07:30', end: '08:15', subIdx: 2, staffIdx: 3 },
    { day: 4, start: '08:15', end: '09:00', subIdx: 0, staffIdx: 0 },
    { day: 5, start: '07:30', end: '08:15', subIdx: 4, staffIdx: 5 },
    { day: 5, start: '08:15', end: '09:00', subIdx: 1, staffIdx: 1 },
  ]
  for (const s of slotData) {
    const slotId = `slot-${f1aId}-${s.day}-${s.start}`
    await prisma.timetableSlot.upsert({
      where: { id: slotId },
      update: {},
      create: {
        id: slotId, dayOfWeek: s.day, startTime: s.start, endTime: s.end,
        room: `Room ${100 + s.day}`,
        classId: f1aId,
        subjectId: subjects[s.subIdx % subjects.length].id,
        staffId: teacherData[s.staffIdx % teacherData.length].id,
      },
    })
  }

  console.log('✅ Seed complete!')
  console.log(`   School: ${school.name}`)
  console.log(`   Students: ${studentIdx}`)
  console.log(`   Teachers: ${teacherData.length}`)
  console.log(`   Classes: ${classes.length}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
