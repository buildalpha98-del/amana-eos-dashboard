export const SAMPLE_RESOLVED_AUTO: Record<string, string> = {
  "staff.firstName": "Sarah", "staff.lastName": "Doe", "staff.fullName": "Sarah Doe",
  "staff.email": "sarah.doe@example.com", "staff.phone": "0400 000 000",
  "staff.address": "12 Example Street", "staff.city": "Bonnyrigg", "staff.state": "NSW", "staff.postcode": "2177",
  "service.name": "Bonnyrigg OSHC", "service.address": "1 School Lane, Bonnyrigg NSW 2177", "service.entityName": "Amana OSHC Pty Ltd",
  "contract.startDate": "1 February 2026", "contract.endDate": "", "contract.payRate": "$32.50",
  "contract.hoursPerWeek": "38", "contract.position": "Director of Service",
  "contract.contractType": "Part-time permanent", "contract.awardLevel": "Director",
  "manager.firstName": "Daniel", "manager.lastName": "Khoury", "manager.fullName": "Daniel Khoury", "manager.title": "State Manager",
  today: new Date().toLocaleDateString("en-AU"),
  letterDate: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
};
