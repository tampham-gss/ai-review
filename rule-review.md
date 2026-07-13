---
alwaysApply: true
---
AI Agent Guidelines — Kiến trúc & các tầng (Layers)
Quy ước cấu trúc thư mục và trách nhiệm từng tầng trong ứng dụng Next.js App Router. Luồng dữ liệu và gọi hàm một chiều từ giao diện (UI) đến cơ sở dữ liệu.

1. Tổng quan luồng dữ liệu (Flow Overview)
[UI / Components] ──► [Server Actions] (src/actions/) ──► [Server Services] (src/services/) ──► [Prisma / DB]
Server Actions (Một chiều ưu tiên):

Client Component / Server Component gọi Server Actions (src/actions).
Server Actions xử lý authenticate/authorize, trích xuất token, bọc transaction và gọi Server Services (src/services/server).
Server Services thực thi logic nghiệp vụ và thao tác với Database bằng Prisma hoặc gọi API ngoài (GraphQL/Strapi).
Client API Route Handler (Khi cần API truyền thống/tải file):

UI Component / SWR Hooks gọi Client Services (src/services/).
API Route Handler gọi Server Services (src/services/) để truy vấn/cập nhật cơ sở dữ liệu.
2. Cấu trúc thư mục thực tế (src/)
src/
├── actions/           # Server Actions (theo domain/resource) bọc bởi withActionExceptionHandler
├── services/          # Tầng Services (Business logic & Data fetching)
├── forms/             # Định nghĩa cấu trúc data (TypeScript Types) và Yup schemas validation cho Forms
├── states/            # Quản lý Local/Shared State bằng Jotai (atoms, atomWithStorage)
├── configs/           # Cấu hình Singletons (prisma, nextauth, redis, firebase, environment, menu)
├── components/        # Giao diện UI thiết kế theo Atomic Design (atoms, molecules, organisms)
├── hooks/             # Custom React Hooks chạy phía client-side
├── utils/             # Thư viện tiện ích dùng chung (graphql, string, object, server helpers...)
├── constants/         # Các hằng số định nghĩa chung cho ứng dụng
├── types/             # TypeScript types / interfaces chia sẻ toàn hệ thống
├── messages/          # File localization (i18n) lưu trữ nhãn đa ngôn ngữ
├── providers/         # Các context providers bao quanh ứng dụng (Theme, Redux, Jotai...)
└── app/               # Next.js App Router (Layouts, Pages, Routes, Route Handlers)
3. Tầng Actions (src/actions)
Trách nhiệm
Entry point từ Client Components (qua Form action, nút click, hook).
Đóng vai trò làm cổng bảo vệ/điều phối: Tự động lấy session/token, kiểm tra phân quyền cơ bản.
Bọc exception tập trung sử dụng hàm withActionExceptionHandler từ @/utils/server. Hàm này sẽ tự động:
Inject token (chứa jwt, thông tin user và orgId) làm đối số đầu tiên của handler callback.
Log hoạt động và đo thời gian xử lý của Action.
Trả về response chuẩn hóa dạng { status, data, meta } hoặc xử lý exception và map thành error response chuẩn dạng { status, message, meta }.
Gọi Server Service phù hợp và truyền prisma client hoặc tx (transaction client) cho Service xử lý.
Quy tắc bắt buộc
KHÔNG viết logic nghiệp vụ phức tạp ở đây. Được phép viết logic nghiệp vụ đơn giản để validate input và trả về error ngay (các hàm kiểm tra phải gọi từ service).
KHÔNG viết trực tiếp truy vấn DB prisma.customer.findMany(...) — mọi thao tác cơ sở dữ liệu phải qua Server Service.
ĐƯỢC PHÉP bắt đầu transaction và gọi nhiều Service trong cùng 1 transaction để thực hiện thao tác.
Quy ước đặt tên Action / Service
Tên Server Action và Service luôn bám domain entity chính (Ví dụ: Customer). Hậu tố Action chỉ dùng cho Server Action; Service không có hậu tố Action.

Prefix	Ý nghĩa	Ví dụ Action	Ví dụ Service
create	Tạo mới	createCustomerAction	createCustomer
update	Cập nhật	updateCustomerAction	updateCustomer
get	Lấy thông tin	getCustomerAction (1)	getCustomer
get	Lấy danh sách	getCustomersAction (n)	getCustomers
Quy tắc bổ sung:

Entity số ít cho thao tác một bản ghi; thêm s cho danh sách (getCustomers).
File triển khai: src/actions/customer.ts, src/services/server/customer.ts.

Ví dụ
"use server";

import { prisma } from "@/configs/prisma";
import { createCustomer } from "@/services/server/customer";
import { HttpStatusCode } from "@/types/api";
import { CustomerInfo } from "@/types/strapi";
import { withActionExceptionHandler } from "@/utils/server";

export const createCustomerAction = withActionExceptionHandler<
  Partial<CustomerInfo>,
  Customer
>(async (token, customer) => {
  const organizationId = Number(token.user.orgId);
  const createdById = Number(token.user.id);

  // Business logic: validate code exists before creating
  const isCodeExists = await checkCodeExists(prisma, customer.code);
  if (isCodeExists) {
    return { status: HttpStatusCode.BadRequest, message: "Customer code already exists" };
  }

  // Gọi Server Service và truyền prisma singleton hoặc transaction client (tx)
  const createdCustomer = await createCustomer(prisma, {
    ...customer,
    organizationId,
    createdById,
  });

  return { status: HttpStatusCode.Ok, data: createdCustomer };
});
4. Tầng Services (src/services)
Trách nhiệm
Chứa logic nghiệp vụ lõi (Core Business Logic).
Truy cập Cơ sở dữ liệu / APIs: Trực tiếp query bằng Prisma hoặc gọi Strapi GraphQL API bằng graphql-request.
Nhận Prisma Client / Transaction làm tham số đầu tiên (tx: PrismaClientTransaction hoặc prisma) để dễ dàng gom nhiều Service call dùng chung.
Quy tắc bắt buộc
KHÔNG sử dụng/phụ thuộc vào NextRequest, NextResponse, cookies(), headers() tại đây để đảm bảo hàm độc lập với môi trường web request và có thể test độc lập (Unit Test).
Nhận thông tin phân quyền/user context (ví dụ organizationId, userId) qua tham số truyền từ Action.
KHÔNG trả về response chuẩn hóa dạng { status, data, meta } hoặc error { status, message, meta } — CHỈ trả về data kết quả thao tác (Action layer xử lý phần chuẩn hóa).
Khi viết các hàm create, update trong service, ưu tiên xử lý nested create/update thông qua tx object để đảm bảo tính toàn vẹn dữ liệu. Tạo các utility function tại thư mục src/utils/<domain>.ts nếu cần thiết, ví dụ các hàm build Prisma input object với đầy đủ giá trị mặc định.
Quy ước đặt tên: [verb][EntityName] — KHÔNG có hậu tố Action.

createCustomer   → src/services/server/customer.ts
getCustomers     → src/services/server/customer.ts
updateCustomer   → src/services/server/customer.ts
Ví dụ cơ bản
import { PrismaClientTransaction } from "@/configs/prisma";
import { Customer } from "@prisma/client";
import { CustomerInfo } from "@/types/strapi";

/**
 * Tạo mới một khách hàng trên Server Database
 */
export const createCustomer = async (
  tx: PrismaClientTransaction, // Nhận prisma client hoặc transaction client
  data: Partial<CustomerInfo>,
): Promise<Customer> => {
  return await tx.customer.create({
    data: {
      code: data.code,
      name: data.name,
      organizationId: data.organizationId,
      createdById: data.createdById,
    },
  });
};
Ví dụ nested update qua tx + utility builder
// src/utils/userDetail.ts
export const updateUserDetailEntity = (
  entity: Partial<UserDetailInfo>,
  currentUserDetail?: Partial<UserDetailInfo>
): Prisma.UserDetailUpdateInput => {
  const { firstName, lastName, dateOfBirth, gender, description, address } = trim(entity);

  const updatedAt = entity.updatedAt || new Date();

  return {
    ...(!isUndefined(firstName) && { firstName }),
    ...(!isUndefined(lastName) && { lastName }),
    ...(!isUndefined(dateOfBirth) && { dateOfBirth }),
    ...(!isUndefined(gender) && { gender }),
    ...(!isUndefined(description) && { description }),
    ...(!isUndefined(address) && {
      UserDetailAddressLinks: {
        update: {
          addressInformation: {
            update: updateAddressInformationEntity({ ...address }, currentUserDetail?.address),
          },
        },
      },
    }),
    updatedAt,
  };
};

// src/utils/user.ts
export const updateUserEntity = (
  entity: Partial<UserInfo>,
  currentUser?: Partial<UserInfo>
): Prisma.UserUpdateInput => {
  const { phoneNumber, detail, setting } = trim(entity);

  const updatedAt = entity.updatedAt || new Date();

  return {
    ...(phoneNumber && { phoneNumber }),
    ...(!isUndefined(detail) && {
      UserDetailLinks: {
        update: {
          userDetail: {
            update: updateUserDetailEntity({ ...detail }, currentUser?.detail),
          },
        },
      },
    }),
    ...(!isUndefined(setting) && {
      UserSettingLinks: {
        update: {
          userSetting: {
            update: updateUserSettingEntity({ ...setting }),
          },
        },
      },
    }),
    updatedAt,
  };
};

// src/utils/user.ts
export const updateUser = async (
  prismaClient: PrismaClientTransaction,
  entity: Partial<UserInfo>,
  currentUser?: Partial<UserInfo>
) => {
  const { id, detail, setting } = entity;

  const updatedUser = await prismaClient.user.update({
    where: { id: Number(id) },
    data: updateUserEntity({ ...entity, detail, setting }, currentUser),
  });

  return updatedUser;
};
5. Tầng Forms (src/forms)
Trách nhiệm
Định nghĩa các kiểu dữ liệu dùng cho biểu mẫu nhập liệu (Form Input/Update Types).
Xây dựng các schema validation chặt chẽ bằng thư viện Yup (ví dụ customerInputFormSchema).
Đảm bảo tính nhất quán của dữ liệu từ Client-side (React Hook Form) cho tới Server-side trước khi truyền qua tầng service.
Dùng errorRequired, errorMaxLength từ @/utils/yup để chuẩn hóa thông báo lỗi trên toàn hệ thống.
Ví dụ
import * as yup from "yup";
import { YubObjectSchema } from "@/types";
import { errorRequired, errorMaxLength } from "@/utils/yup";

export type CustomerInputForm = {
  code: string;
  name: string;
  taxCode?: string | null;
};

export const customerInputFormSchema = yup.object<
  YubObjectSchema<CustomerInputForm>
>({
  code: yup
    .string()
    .trim()
    .required(errorRequired("customer.customer_code"))
    .max(20, errorMaxLength(20)),
  name: yup
    .string()
    .trim()
    .required(errorRequired("customer.customer_name"))
    .max(255, errorMaxLength(255)),
  taxCode: yup.string().trim().max(20, errorMaxLength(20)).nullable(),
});
6. Tầng Quản lý Trạng thái (src/states)
Quản lý các trạng thái dạng nguyên tử (atoms), chia sẻ giữa các UI Component bằng Jotai.
Hỗ trợ lưu trữ trạng thái lâu dài xuống cookies/localStorage qua atomWithStorage (ví dụ: kích thước sidebar compact, view mode của grid...).
Đặt tại src/states/.
7. Tầng Configs (src/configs)
Khởi tạo và export các client singletons dùng chung để tránh rò rỉ bộ nhớ hoặc tạo quá nhiều connection. KHÔNG khởi tạo lại (re-instantiate) singleton ở nơi khác.
Các module cấu hình tiêu biểu:
prisma.ts: Cung cấp prisma client và kiểu dữ liệu PrismaClientTransaction.
redis.ts, firebase.ts, nextauth.ts: Cấu hình tích hợp dịch vụ bên ngoài.
8. Ma trận phụ thuộc (Dependency Matrix)
Quy tắc import và gọi hàm giữa các tầng:

Tầng gọi (From)	Có thể gọi (Can Call)	KHÔNG ĐƯỢC gọi (Cannot Call)
Actions	services/server, configs, utils (server/shared)	services/client, direct Prisma query (phải qua service), UI Components
Services (Server)	configs (prisma), utils (shared), Service Server khác	Actions, REST API routes, bất kỳ client-side logic nào
Forms	types, utils/yup	Actions, Services, bất kỳ stateful logic nào
Components / UI	Actions, services/client, states (Jotai), forms	Trực tiếp services/server hoặc Prisma DB
9. Coding Style & Best Practices
Strict TypeScript: Tránh dùng any. Định nghĩa types tại src/types/ hoặc src/forms/.
Server vs Client Components: Mặc định dùng Server Components. Chỉ thêm "use client" khi cần tương tác phía browser (hooks, event listeners, local state).
Dependency Injection: Truyền prisma hoặc tx vào services để dễ Unit Test và đảm bảo tính ACID.
Naming: Dùng camelCase cho biến/hàm và PascalCase cho Components/Types/Interfaces. Tên phải phản ánh đúng domain nghiệp vụ. Dùng dạng số nhiều (thêm s) cho các thao tác lấy danh sách (getCustomers).
File theo domain: src/actions/customer.ts, src/services/server/customer.ts, src/forms/customer.ts.



Quy tắc đặt tên file theo Domain nghiệp vụ
1. Phạm vi áp dụng
Quy tắc này áp dụng cho tên file (không bao gồm phần mở rộng, ví dụ .ts, .tsx) nằm trong 4 thư mục sau:

src/actions/
src/services/         (bao gồm cả src/services/server, src/services/client nếu có)
src/types/
src/utils/
Lưu ý: quy tắc chỉ kiểm soát tên file gốc. Các file lồng trong thư mục con theo domain (ví dụ src/services/server/customer/index.ts) thì tên thư mục cha (customer) phải tuân theo danh sách dưới đây, áp dụng tương tự như tên file.

2. Danh sách Domain hợp lệ (Whitelist)
Tên file (không tính ngoại lệ ở mục 3) CHỈ ĐƯỢC PHÉP là một trong các domain entity sau, viết đúng dạng camelCase như liệt kê — không thêm số nhiều, không viết tắt, không đổi thứ tự ký tự:

accessLog
addressInformation
administrativeUnit
advance
area
bankAccount
classification
contact
containerType
contract
customField
customerClassification
customerGroup
customer
department
documentType
driverExpense
driverLicenseType
driverReportDetail
driverReportItem
driverReport
driver
dynamicAnalysisFilter
dynamicAnalysis
emailTemplate
expenseType
fuelLog
gasStation
maintenanceType
maintenance
merchandiseType
notificationRecipient
notification
operation
orderDetail
orderExpense
orderGroupStatus
orderGroup
orderItem
orderPackingMaterial
orderParticipant
orderRequestDetail
orderRequestExpense
orderRequestStatus
orderRequest
orderRouteStatus
orderShippingSchedule
orderStatus
orderTripCapture
orderTripExpense
orderTripMessage
orderTripStatus
orderTrip
order
organizationInitialValue
organizationMember
organizationReport
organizationRole
organizationSettingExtended
organizationSetting
organization
packingMaterialUsage
packingMaterial
reasonCatalog
resource
routeDriverExpense
routePointAttributeDetail
routePointAttribute
routePointGroup
routePointItem
routePointType
routePoint
routePricingByUnit
routePricingByVehicleType
route
service
setting
settingsDefinition
shareObject
ship
shippingSchedule
smtpSetting
subcontractor
token
trailerType
trailer
tripDriverExpense
unitOfMeasure
user
userDetail
userGuide
userLinkedAccount
userSession
userSetting
vehicleGroup
vehicleTracking
vehicleType
vehicle
warehouse
workflow
zonePricingByUnit
zonePricingByVehicleType
zone
3. Danh sách Ngoại lệ kỹ thuật (Allowed exceptions)
Ngoài danh sách domain ở mục 2, các tên file sau được phép tồn tại trong 4 thư mục trên vì là tiện ích/hạ tầng kỹ thuật chung, không gắn với một domain nghiệp vụ cụ thể:

api
auth
plugin
file
filter
number
object
form
graphql
locale
index
report
4. Quy tắc kiểm tra hợp lệ
Một file trong actions/, services/, types/, utils/ được coi là ĐÚNG khi và chỉ khi tên file (bỏ phần mở rộng) thuộc một trong hai danh sách ở mục 2 hoặc mục 3.

Một file được coi là SAI nếu:

Tên không khớp chính xác với bất kỳ entry nào ở mục 2 hoặc mục 3 (kể cả khi gần đúng, viết hoa/thường sai, số nhiều/số ít sai, hoặc là từ đồng nghĩa).
Là tên ghép nhiều domain không có trong danh sách (ví dụ customerOrder.ts, driverVehicle.ts) — phải tách theo đúng domain entity tương ứng đã định nghĩa sẵn, hoặc đặt logic dùng chung vào file của domain "chính" phù hợp nhất theo danh sách.
Là tên viết tắt, rút gọn, hoặc biến thể không chuẩn của một domain hợp lệ (ví dụ cust.ts, org.ts, veh.ts).
Ví dụ
File	Hợp lệ?	Lý do
src/services/server/customer.ts	✅	customer có trong danh sách domain
src/actions/orderTrip.ts	✅	orderTrip có trong danh sách domain
src/utils/string.ts	❌	string không có trong whitelist domain và không thuộc danh sách ngoại lệ
src/utils/object.ts	✅	object thuộc danh sách ngoại lệ kỹ thuật
src/types/customers.ts	❌	sai vì số nhiều — phải là customer.ts
src/services/server/driverVehicle.ts	❌	tên ghép domain không tồn tại — tách thành driver.ts và/hoặc vehicle.ts
src/actions/auth.ts	✅	auth thuộc danh sách ngoại lệ kỹ thuật
5. Hành động khi phát hiện file sai
Khi tạo file mới: AI Agent / Developer phải chọn đúng domain entity có sẵn trong danh sách mục 2, hoặc dùng đúng tên ngoại lệ ở mục 3. Tuyệt đối không tự đặt tên mới nằm ngoài 2 danh sách này trong 4 thư mục nói trên.
Khi phát hiện file đã tồn tại có tên sai: đề xuất rename về đúng domain entity tương ứng, hoặc tách/gộp logic về đúng các domain hợp lệ liên quan, đồng thời cập nhật toàn bộ import path liên quan.
Không tạo thêm domain mới ngoài danh sách mà không cập nhật file rule này trước.
// ❌ Tránh: để lỗi lan ra, user thấy message raw
const { status } = await createOrder(data);
if (status !== HttpStatusCode.Ok) throw new Error(res.statusText);

// ✅ Tốt: map lỗi thành message nghiệp vụ
if (status !== HttpStatusCode.Ok) {
  const message =
    res.status === HttpStatusCode.Conflict
      ? t("common.messages.conflict_error_message")
      : t("common.messages.success_message");

  return {
    status: HttpStatusCode.BadRequest,
    message,
  };
}

Variables, Equality & Control

Truy cập property: dùng dot notation khi có thể
type Luke = { jedi: boolean; age: number };
const luke: Luke = { jedi: true, age: 28 };

// ❌ Tránh: bracket không cần thiết khi key cố định
const isJedi = luke["jedi"];

// ✅ Tốt
const isJedi = luke.jedi;
Truy cập bằng biến: dùng bracket notation []
type Luke = { jedi: boolean; age: number };
const luke: Luke = { jedi: true, age: 28 };

// ❌ Tránh: dot notation không dùng được với biến
function getPropBad(prop: string): boolean | number {
  return (luke as Record<string, boolean | number>).prop; // luôn undefined
}

// ✅ Tốt
function getProp(prop: keyof Luke): boolean | number {
  return luke[prop];
}
const isJedi = getProp("jedi");
Lũy thừa: dùng toán tử **
// ❌ Tránh
const binary = Math.pow(2, 10);

// ✅ Tốt
const binary = 2 ** 10;
Variables
Luôn khai báo bằng const hoặc let; tránh biến toàn cục
// ❌ Tránh: thiếu const/let → biến global
superPower = new SuperPower();

// ✅ Tốt
const superPower = new SuperPower();
Mỗi biến một khai báo (một const/let)
// ❌ Tránh: nhiều biến một dòng, dễ nhầm
const items = getItems(),
  goSportsTeam = true,
  dragonball = "z";

// ✅ Tốt
const items = getItems();
const goSportsTeam = true;
const dragonball = "z";
Nhóm const trước, rồi nhóm let
// ❌ Tránh: const và let lẫn lộn
let i: number;
const items = getItems();
let dragonball: string;
const goSportsTeam = true;
let len: number;

// ✅ Tốt
const goSportsTeam = true;
const items = getItems();
let dragonball: string;
let i: number;
let length: number;
Tránh chain assignment (tạo biến global ngầm)
// ❌ Tránh: chỉ a là let, b và c thành global (trong strict mode sẽ lỗi)
(function example(): void {
  let a = (b = c = 1) as number;
})();
// console.log(a); // ReferenceError
// console.log(b); // 1 — global
// console.log(c); // 1 — global

// ✅ Tốt
(function example(): void {
  let a = 1;
  let b = a;
  let c = a;
})();
Tránh ++/--; dùng += 1/-= 1
const array = [1, 2, 3];
let num = 1;

// ❌ Tránh
num++;
--num;
for (let i = 0; i < array.length; i++) {
  const value = array[i];
  if (value) truthyCount++;
}

// ✅ Tốt
num += 1;
num -= 1;
const sum = array.reduce((a, b) => a + b, 0);
const truthyCount = array.filter(Boolean).length;
Không có dòng trống trước/sau = trong assignment
// ❌ Tránh
const foo =
  superLongLongLongLongLongLongLongLongFunctionName();

// ❌ Tránh
const foo
  = 'một chuỗi rất rất rất rất rất rất rất rất rất rất là dài';

// ✅ Tốt
const foo = (
  superLongLongLongLongLongLongLongLongFunctionName()
);

// ✅ Tốt
const foo = 'một chuỗi rất rất rất rất rất rất rất rất rất rất là dài';
Không để biến unused
// ❌ Tránh
const someUnusedVar = 42;
function getX(x: number, y: number): number {
  return x; // y unused
}

// ✅ Tốt
function getXPlusY(x: number, y: number): number {
  return x + y;
}
const x = 1;
const y = 2;
getXPlusY(x, y);
Hoisting
var bị hoist lên đầu function; const/let nằm trong TDZ (Temporal Dead Zone) cho đến dòng khai báo. Function declaration hoist cả tên và body; function expression chỉ hoist biến.

// var: declaration hoist, assignment không
function exampleVar(): void {
  console.log(declaredButNotAssigned); // undefined
  var declaredButNotAssigned = true;
}

// const/let: TDZ — truy cập trước dòng khai báo → ReferenceError
function exampleLet(): void {
  console.log(declaredButNotAssigned); // ReferenceError
  const declaredButNotAssigned = true;
}

// ✅ Tốt: khai báo trước khi dùng
const a = 10;
function fun(): void {}
fun();
class A {}
new A();
Comparison Operators & Equality
Dùng === và !==, không dùng ==/!=
// ❌ Tránh: == ép kiểu, dễ gây bug
if (value == null) {
}
if (count == "3") {
}

// ✅ Tốt
if (value === null || value === undefined) {
}
if (count === 3) {
}
Boolean: có thể dùng shortcut; string/number nên so sánh rõ ràng
// ✅ Tốt: boolean
if (isValid) {
}

// ❌ Tránh: string/number dùng truthy dễ nhầm (0, '')
if (name) {
}
if (collection.length) {
}

// ✅ Tốt
if (name !== "") {
}
if (collection.length > 0) {
}
Trong switch, case/default có khai báo lexical thì bọc trong block {}
// ❌ Tránh: let/const trong case không có block → lỗi redeclare
switch (foo) {
  case 1:
    let x = 1;
    break;
  case 2:
    const y = 2;
    break;
}

// ✅ Tốt
switch (foo) {
  case 1: {
    let x = 1;
    break;
  }
  case 2: {
    const y = 2;
    break;
  }
  default: {
    const z = 3;
  }
}
Tránh ternary lồng nhau; ưu tiên một dòng hoặc tách biến
// ❌ Tránh
const foo = maybe1 > maybe2 ? "bar" : value1 > value2 ? "baz" : null;

// ✅ Tốt: tách biến
const maybeNull = value1 > value2 ? "baz" : null;
const foo = maybe1 > maybe2 ? "bar" : maybeNull;
Tránh ternary thừa: a ? a : b → a || b hoặc a ?? b
// ❌ Tránh
const foo = a ? a : b;
const bar = c ? true : false;
const baz = c ? false : true;
const quux = a != null ? a : b;

// ✅ Tốt
const foo = a || b;
const bar = !!c;
const baz = !c;
const quux = a ?? b;
Trộn toán tử: thêm ngoặc để rõ ý (trừ +, -, **)
// ❌ Tránh: thứ tự ưu tiên khó đọc
const foo = (a && b < 0) || c > 0 || d + 1 === 0;
if (a || (b && c)) return d;

// ✅ Tốt
const foo = (a && b < 0) || c > 0 || d + 1 === 0;
if (a || (b && c)) return d;
Nullish coalescing ??: chỉ fallback khi null/undefined
// ❌ Tránh: 0 và '' cũng bị thay bằng default
const value = 0 ?? "default"; // 0 (OK) nhưng ý không rõ
const name = "" ?? "default"; // '' (OK)

// ✅ Tốt: ?? chỉ với null/undefined
const value = null ?? "default";
const user = { name: "John", age: null };
const age = user.age ?? 18;
Blocks
Block nhiều dòng: luôn dùng ngoặc {}
// ❌ Tránh
if (test) return false;

// ✅ Tốt: nhiều dòng thì có block
if (test) {
  thing1();
  return false;
}
else đặt cùng dòng với } của if
// ❌ Tránh
if (test) {
  thing1();
}
else {
  thing3();
}

// ✅ Tốt
if (test) {
  thing1();
} else {
  thing3();
}
Nếu if đã return thì không cần else; có thể tách thành nhiều if
// ❌ Tránh
function foo(x: number, y: number): number {
  if (x) {
    return x;
  } else {
    return y;
  }
}

// ✅ Tốt
function foo(x: number, y: number): number {
  if (x) {
    return x;
  }
  return y;
}

// ✅ Tốt: nhiều nhánh
function cats(x: number, y: number): number | undefined {
  if (x) return x;
  if (y) return y;
}
Control Statements
Điều kiện dài: xuống dòng, toán tử logic ở đầu dòng
// ❌ Tránh: một dòng quá dài
if ((foo === 123 || bar === "abc") && doesItLookGoodWhenItBecomesThatLong() && isThisReallyHappening()) {
  thing1();
}

// ✅ Tốt
if (
  (foo === 123 || bar === "abc") &&
  doesItLookGoodWhenItBecomesThatLong() &&
  isThisReallyHappening()
) {
  thing1();
}
Không dùng selection operator thay cho control statement
// ❌ Tránh: dùng && như if
!isRunning && startRunning();

// ✅ Tốt
if (!isRunning) {
  startRunning();
}


Comments & Formatting
Comments
Bắt buộc comment cho function và API; Function Component có thể bỏ qua
Mọi function và API (exported function, public method) cần có comment mô tả (JSDoc hoặc block comment). Function Component (React) có thể không cần nếu tên component và props đã rõ nghĩa. Comment cho type phức tạp / khó hiểu; type đơn giản, tên biến/callback dễ hiểu thì không bắt buộc.

// ✅ Tốt: function/API có JSDoc
/**
 * Parse query string thành object. Hỗ trợ array (key[]=a&key[]=b) và nested.
 * @param search - Chuỗi query (vd. "?a=1&b=2")
 * @returns Object key-value
 */
export function parseQueryString(search: string): Record<string, string | string[]> {
  // ...
}

// ✅ Tốt: Function Component có thể không comment nếu tên + props rõ
type UserCardProps = { name: string; avatar?: string };
export function UserCard({ name, avatar }: UserCardProps) {
  return <div>{name}</div>;
}

// ✅ Tốt: type phức tạp nên có comment
/**
 * Map locale -> override cho từng key. Key rỗng = dùng default.
 */
type LocaleOverrides = Record<string, Record<string, string> | null>;

// không bắt buộc: type đơn giản, tên rõ
type Id = string;
const onSave = (value: string) => {};
Comment nhiều dòng: dùng /** ... */ (JSDoc cho function/API)
// ❌ Tránh: nhiều dòng bằng //
// make() returns a new element
// based on the passed-in tag name
function make(tag: string): Element {
  return document.createElement(tag);
}

// ✅ Tốt
/**
 * Tạo element mới theo tag name.
 * @param tag - Tên thẻ HTML (vd. 'div', 'span')
 * @returns Element đã tạo
 */
function make(tag: string): Element {
  return document.createElement(tag);
}
Comment một dòng: dùng //, đặt ở dòng trên; có dòng trống trước (trừ dòng đầu block)
// ❌ Tránh: comment cùng dòng
const active = true; // is current tab

// ✅ Tốt
// is current tab
const active = true;

// ✅ Tốt: trong function, có dòng trống trước comment
function getType(): string {
  console.log("fetching type...");
  // set the default type to 'no type'
  const type = this.type ?? "no type";
  return type;
}
Bắt đầu comment bằng một space (dễ đọc)
// ❌ Tránh
//is current tab
const active = true;

// ❌ Tránh
/**
 *make() returns a new element
 */
function make(tag: string): Element {
  return document.createElement(tag);
}

// ✅ Tốt
// is current tab
const active = true;

// ✅ Tốt
/**
 * make() returns a new element based on the passed-in tag name.
 */
function make(tag: string): Element {
  return document.createElement(tag);
}


UI Coding Rules
Không sử dụng inline style
Không dùng inline style (attribute style={{ ... }}). Style được định nghĩa qua:

CSS module (.module.css),
Tailwind (class),
hoặc styled-component / CSS-in-JS theo quy ước dự án.
Ví dụ:

// ❌ Tránh
<div style={{ marginTop: 16, color: 'red' }}>...</div>

// ✅ Tốt (CSS module)
<div className={styles.container}>...</div>

// ✅ Tốt (Tailwind)
<div className="mt-4 text-red-500">...</div>
Không sử dụng inline function trong component
Không truyền inline function (hàm tạo mới mỗi lần render) vào prop của component, đặc biệt component con là React.memo hoặc nằm trong list. Nên dùng useCallback để định nghĩa handler và truyền reference ổn định.

Ví dụ:

// ❌ Tránh: tạo hàm mới mỗi lần render
<Button onClick={() => handleSave(id)} />;

// ✅ Tốt
const handleClick = useCallback(() => handleSave(id), [id]);
<Button onClick={handleClick} />;
Nếu handler đơn giản và không ảnh hưởng performance (ví dụ không trong list dài), team có thể cho phép ngoại lệ; nên thống nhất trong code review.


Kiểm tra trên mọi kích thước màn hình
Màn hình phải được kiểm tra trên tất cả kích thước màn hình (mobile, tablet, desktop) theo breakpoint của dự án. Layout và tương tác phải dùng được, không vỡ giao diện hoặc mất chức năng quan trọng trên mobile.

Translation
Text hard-code chuyển vào vi.json
Tất cả text hard-code (label, message, placeholder) phải được chuyển vào file vi.json (hoặc file ngôn ngữ tương ứng) để hỗ trợ đa ngôn ngữ và dễ thay đổi copy sau này.

Ví dụ: Thay vì <span>Lưu</span>, dùng <span>{t('common.save')}</span> với key common.save trong vi.json.

Navigation
Kiểm tra điều hướng đúng
Tất cả các link (menu, breadcrumb, nút điều hướng) phải được kiểm tra điều hướng đúng màn hình (đúng route, không 404, không loop).

Props & Refs
Quy ước đặt tên props, giá trị mặc định, accessibility (alt, ARIA), key ổn định, ref callback và tránh isMounted (theo React/JSX Style Guide).

Props
Tên prop: camelCase; prop là component thì PascalCase
Tên prop dùng camelCase.
Nếu giá trị prop là React component thì tên prop có thể dùng PascalCase (ví dụ Component={SomeComponent}).
// ❌ Tránh
<Foo
  UserName="hello"
  phone_number={12345678}
/>

// ✅ Tốt
<Foo
  userName="hello"
  phoneNumber={12345678}
  Component={SomeComponent}
/>
Prop boolean true: bỏ giá trị
Khi prop có giá trị đúng là true, chỉ ghi tên prop, không ghi ={true}.

// ❌ Tránh
<Foo hidden={true} />

// ✅ Tốt
<Foo hidden />

// ✅ Tốt (một dòng)
<Foo hidden />
Thẻ img: luôn có alt
Mọi thẻ <img> phải có prop alt. Ảnh trang trí: alt="" hoặc dùng role="presentation".

// ❌ Tránh
<img src="hello.jpg" />

// ✅ Tốt
<img src="hello.jpg" alt="Mô tả ảnh" />

// ✅ Tốt: ảnh trang trí
<img src="hello.jpg" alt="" />
<img src="hello.jpg" role="presentation" />
Không dùng "image", "photo", "picture" trong alt
Screen reader đã đọc thẻ img là ảnh; không cần lặp lại từ "image", "photo", "picture" trong alt.

// ❌ Tránh
<img src="hello.jpg" alt="Picture of me waving hello" />

// ✅ Tốt
<img src="hello.jpg" alt="Me waving hello" />
ARIA role: chỉ dùng role hợp lệ
Chỉ dùng ARIA role hợp lệ, không dùng role trừu tượng (abstract). Ví dụ: role="datepicker" không phải role chuẩn; role="range" là abstract.

// ❌ Tránh
<div role="datepicker" />
<div role="range" />

// ✅ Tốt
<div role="button" />
Không dùng accessKey
Không dùng accessKey trên element — dễ xung đột phím tắt với screen reader và bàn phím.

// ❌ Tránh
<div accessKey="h" />

// ✅ Tốt
<div />
Key: dùng ID ổn định, tránh index
Không dùng index của mảng làm key khi thứ tự có thể thay đổi (thêm/xóa/sắp xếp). Dùng id ổn định (từ data).

// ❌ Tránh
{
  todos.map((todo, index) => <Todo {...todo} key={index} />);
}

// ✅ Tốt
{
  todos.map((todo) => <Todo {...todo} key={todo.id} />);
}
defaultProps cho prop không bắt buộc
Với TypeScript: prop optional nên có giá trị mặc định (trong destructuring hoặc defaultProps) để code dễ đọc và giảm kiểm tra undefined.

// ✅ Tốt: default trong destructuring
type Props = { foo: number; bar?: string; children?: React.ReactNode };
function SFC({ foo, bar = "", children = null }: Props) {
  return (
    <div>
      {foo}
      {bar}
      {children}
    </div>
  );
}

// ✅ Tốt: defaultProps (nếu team dùng)
SFC.defaultProps = { bar: "", children: null };
Spread props: dùng có chừng mực
Dùng spread props ({...props}) có chừng mực. Ưu tiên lọc bớt prop không cần trước khi truyền xuống để tránh truyền prop thừa hoặc không hợp lệ.

// ❌ Tránh: truyền toàn bộ props
function Wrapper(props: Props) {
  return <WrappedComponent {...props} />;
}

// ✅ Tốt: chỉ truyền props cần thiết
function Wrapper({ irrelevantProp, ...relevantProps }: Props) {
  return <WrappedComponent {...relevantProps} />;
}
Refs
Dùng ref callback, không dùng string ref
Luôn dùng ref dạng callback (hoặc useRef + gán). Không dùng string ref (đã deprecated).

// ❌ Tránh (string ref - deprecated)
<Foo ref="myRef" />;

// ✅ Tốt (function component + useRef)
const myRef = useRef<HTMLDivElement>(null);
return <Foo ref={myRef} />;

// ✅ Tốt (callback ref khi cần)
<Foo
  ref={(el) => {
    this.myRef = el;
  }}
/>;
isMounted
Không dùng isMounted
Không dùng isMounted. Đây là anti-pattern, không có trong component dạng class ES6 và đang bị deprecated. Thay vào đó xử lý cleanup trong useEffect (abort controller, flag cancelled) hoặc kiểm tra điều kiện trước khi setState.

// ❌ Tránh
if (this.isMounted()) {
  this.setState({ ... });
}

// ✅ Tốt: với function component — cleanup trong useEffect
useEffect(() => {
  let cancelled = false;
  fetchData().then((data) => {
    if (!cancelled) setData(data);
  });
  return () => { cancelled = true; };
}, []);


Loading & Empty State
Trải nghiệm khi dữ liệu đang tải hoặc không có dữ liệu.

Skeleton Loading
Đã thêm Skeleton Loading cho các component khi đang tải dữ liệu (thay vì để trống hoặc spinner toàn màn hình khi không cần thiết). Skeleton nên phản ánh layout nội dung sẽ hiển thị (ví dụ: bảng có 5 cột thì skeleton 5 cột).

Ví dụ: Danh sách bảng dùng <TableSkeleton rows={5} />, card dùng <CardSkeleton /> theo design system.

Empty State
Đã thêm Empty State khi không có dữ liệu (danh sách rỗng, không có kết quả tìm kiếm). Empty state nên có message rõ ràng và có thể kèm CTA (ví dụ: "Chưa có đơn hàng" + nút "Tạo đơn hàng").

Ví dụ:

if (isLoading) return <TableSkeleton />;
if (!data?.length) return <EmptyState message="Chưa có dữ liệu" action={<Button>Tạo mới</Button>} />;
return <Table data={data} />;


Hooks & useEffect
Hooks & useEffect
Quy tắc dùng useEffect (dependencies, tránh vòng lặp vô hạn), memoization (useMemo, useCallback), event handler, luôn return giá trị và không dùng underscore cho method "nội bộ" (theo React/JSX Style Guide).

useEffect
Khai báo đúng dependencies
Tất cả useEffect phải khai báo đúng dependency array. Biến/hàm dùng trong effect mà đến từ props/state phải nằm trong mảng dependency để tránh stale closure và hành vi khó đoán.

// ❌ Tránh: thiếu dependency
useEffect(() => {
  fetchUser(userId);
}, []);

// ✅ Tốt
useEffect(() => {
  fetchUser(userId);
}, [userId]);
Hàm fetchUser từ props/context nên đưa vào dependency hoặc wrap bằng useCallback ở nơi định nghĩa.

Không gây vòng lặp render vô hạn
Effect không được gây vòng lặp vô hạn: tránh set state (hoặc trigger re-render) trong effect trong khi dependency là object/array tạo mới mỗi lần render.

// ❌ Tránh: options mới mỗi lần → effect chạy lại → setState → render → effect lại...
useEffect(() => {
  setResult(fetchSomething(options));
}, [options]);

// ✅ Tốt: dependency ổn định (primitive hoặc memoized)
const optionsStable = useMemo(() => ({ page, limit }), [page, limit]);
useEffect(() => {
  setResult(fetchSomething(optionsStable));
}, [optionsStable]);
Memoization
Dùng useMemo / useCallback khi cần
Khi cần tránh tính toán lại hoặc tránh tạo hàm mới mỗi lần render (truyền xuống component con hoặc dùng trong dependency của useEffect):

useMemo — cho giá trị (object, array) phụ thuộc props/state.
useCallback — cho hàm (event handler, callback truyền xuống con).
const sortedList = useMemo(
  () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
  [items],
);

const handleSubmit = useCallback(() => {
  submitForm(formData);
}, [formData]);
Chỉ dùng khi thực sự cần (performance hoặc dependency ổn định), tránh lạm dụng.

Event handler
Arrow function khi cần closure biến local
Khi cần truyền thêm dữ liệu vào handler (ví dụ item, index trong map), có thể dùng arrow function trong render. Lưu ý: nếu truyền xuống component tối ưu (PureComponent / React.memo), arrow tạo mới mỗi lần render có thể gây re-render không cần thiết — khi đó nên dùng useCallback hoặc truyền data qua prop khác.

function ItemList({ items, onItemAction }: Props) {
  return (
    <ul>
      {items.map((item, index) => (
        <Item key={item.id} onClick={(e) => onItemAction(e, item.id, index)} />
      ))}
    </ul>
  );
}
Handler ổn định: dùng useCallback
Handler truyền xuống component được memo (React.memo) hoặc dùng trong dependency của useEffect nên wrap bằng useCallback để reference ổn định.

const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

return <ExpensiveChild onClick={handleClick} />;
Return và đặt tên
Component luôn return giá trị
Component (function) phải return một giá trị (JSX, null, ...). Không gọi function rồi bỏ qua kết quả.

// ❌ Tránh
function MyComponent() {
  <div />;
}

// ✅ Tốt
function MyComponent() {
  return <div />;
}
Không dùng underscore cho method "nội bộ"
Không dùng tiền tố underscore (_handleSubmit) để thể hiện method "private". Trong JavaScript mọi thứ đều public; underscore không tạo private. Đặt tên bình thường (ví dụ handleSubmit, onSubmit) cho handler.

// ❌ Tránh
function Form() {
  const _onClickSubmit = () => {
    /* ... */
  };
  return <button onClick={_onClickSubmit}>Submit</button>;
}

// ✅ Tốt
function Form() {
  const onClickSubmit = () => {
    /* ... */
  };
  return <button onClick={onClickSubmit}>Submit</button>;
}


Global State
Quy ước quản lý state toàn cục trong ứng dụng.

Sử dụng Jotai
Sử dụng Jotai để quản lý global state (state cần chia sẻ giữa nhiều component/màn hình).

Ví dụ (minh họa):

import { atom, useAtom } from 'jotai';

const currentOrgIdAtom = atom<string | null>(null);

export function useCurrentOrg() {
  return useAtom(currentOrgIdAtom);
}
Không sử dụng Redux
Dự án không dùng Redux cho global state. Mọi state chung dùng Jotai (hoặc context nếu team quy định bổ sung).


Quy tắc Component
Quy tắc cơ bản cho React component: một component mỗi file, chỉ Function Component, đặt tên file/reference, không mixins, và các quy ước cấu trúc của team (type, UI reuse, input, Modal).

Quy tắc cơ bản
Một component mỗi file
Mỗi file chỉ chứa một React component. Trường hợp ngoại lệ: nhiều Stateless / Pure Component (component không state) có thể đặt chung một file nếu chúng liên quan chặt chẽ.

Luôn dùng cú pháp JSX
Luôn viết component bằng JSX. Không dùng React.createElement trừ khi khởi tạo app từ file không phải JSX/TSX.

// ❌ Tránh
return React.createElement("div", { className: "box" }, "Hello");

// ✅ Tốt
return <div className="box">Hello</div>;
Chỉ sử dụng Function Component
Dự án chỉ dùng Function Component, không dùng Class Component. Component không state nên dùng function thường (không arrow) để tên component hiển thị đúng trong DevTools.

// ✅ Tốt
function CustomerCard({ customer }: { customer: Customer }) {
  return <div>{customer.name}</div>;
}

// tránh: arrow function khiến tên component có thể bị hiển thị dạng anonymous
const Listing = ({ hello }: { hello: string }) => <div>{hello}</div>;

// tránh
class CustomerCard extends React.Component { ... }
Không dùng Mixins
Không dùng mixins. Mixin tạo phụ thuộc ngầm, dễ trùng tên và phình logic. Thay vào đó dùng component, HOC (Higher-Order Component) hoặc module tiện ích.

Đặt tên (Naming)
Extension và tên file
Dùng extension .tsx cho file chứa React component (dự án TypeScript).
Tên file dùng PascalCase. Ví dụ: ReservationCard.tsx, UserAvatar.tsx.
Reference: PascalCase cho component, camelCase cho instance
Component (import / biến component): dùng PascalCase.
Instance (biến chứa element/component đã render): dùng camelCase.
// ❌ Tránh
import reservationCard from "./ReservationCard";
const ReservationItem = <ReservationCard />;

// ✅ Tốt
import ReservationCard from "./ReservationCard";
const reservationItem = <ReservationCard />;
Tên component trùng tên file; thư mục dùng index
Tên component (reference) trùng với tên file (bỏ extension). Ví dụ: ReservationCard.tsx → component ReservationCard.
Với component gốc của một thư mục: dùng file index.ts và đặt tên component theo tên thư mục.
// ❌ Tránh
import Footer from "./Footer/Footer";
import Footer from "./Footer/index";

// ✅ Tốt
import Footer from "./Footer";
Higher-Order Component (HOC): đặt displayName
HOC nên gán displayName dạng withFoo(Bar) (tên HOC + tên component được bọc) để DevTools và thông báo lỗi dễ đọc.

// ❌ Tránh
export default function withFoo(WrappedComponent: React.ComponentType<Props>) {
  return function WithFoo(props: Props) {
    return <WrappedComponent {...props} foo />;
  };
}

// ✅ Tốt
export default function withFoo(WrappedComponent: React.ComponentType<Props>) {
  function WithFoo(props: Props) {
    return <WrappedComponent {...props} foo />;
  }
  const name =
    WrappedComponent.displayName ?? WrappedComponent.name ?? "Component";
  WithFoo.displayName = `withFoo(${name})`;
  return WithFoo;
}
Không dùng tên prop trùng DOM
Tránh dùng tên prop của DOM (như style, className) cho mục đích khác. Người đọc mong đợi style/className có nghĩa chuẩn; dùng sai sẽ khó bảo trì và dễ lỗi.

// ❌ Tránh
<MyComponent style="fancy" />
<MyComponent className="fancy" />

// ✅ Tốt
<MyComponent variant="fancy" />
Declaration
Không dùng displayName để đặt tên component
Đặt tên component bằng reference (tên function/const), không dùng displayName. Ví dụ: export function ReservationCard thì component đã có tên rõ ràng.

// ❌ Tránh (pattern cũ)
export default React.createClass({
  displayName: "ReservationCard",
  // ...
});

// ✅ Tốt
export default function ReservationCard() {
  return <div />;
}
Type và cấu trúc
Chỉ định nghĩa type, không dùng interface
Khi định nghĩa props hoặc object shape, dùng type (TypeScript), không dùng interface theo convention dự án.

// ✅ Tốt
type CustomerCardProps = {
  customer: Customer;
  onSelect?: (id: string) => void;
};

// tránh (theo convention)
interface CustomerCardProps { ... }
UI component tái sử dụng
Dùng component chung (design system / atoms / molecules) cho: số liệu, ngày giờ, avatar, trạng thái (badge, status), email, số điện thoại. Không tự format/style lại từ đầu ở mỗi màn hình.

Ví dụ: Dùng <DateTime value={order.createdAt} />, <PhoneNumber value={customer.phone} /> thay vì format rải rác.

Đúng component cho từng loại input
Dùng đúng component theo design system: TextField (text, email, ...), NumberField (số), Select, DatePicker, Checkbox, v.v. Không dùng <input type="text"> thô khi đã có TextField.

Component không tái sử dụng
Component chỉ sử dụng cho một màn hình cần được đặt trong thư mục components thuộc thư mục màn hình đó. Ví dụ cấu trúc thư mục cho một màn hình có component riêng:

app/
└── [locale]/
    └── orgs/
        └── [orgId]/
            └── vehicles/
                ├── page.tsx
                └── components/
                    └── VehicleFilter.tsx
VehicleFilter.tsx: Chỉ sử dụng cho màn hình danh sách vehicles này.
Các component chỉ dùng riêng cho màn hình sẽ không đặt chung với components tái sử dụng toàn app.
Việc này giúp code dễ tổ chức, dễ tìm kiếm và tránh lẫn lộn với các component dùng chung.

Sắp xếp component đúng cấp (atomic design): atoms, molecules, organisms
Theo phương pháp atomic design, các component phải được chia thành 3 cấp rõ ràng:

Atoms — Các thành phần nhỏ nhất, không thể tách nhỏ thêm nữa. Ví dụ: Button, Input, Label, Icon, Checkbox. Atoms thường không chứa logic phức tạp và chỉ xử lý một chức năng nhỏ.
Molecules — Tổ hợp các atoms kết hợp lại tạo thành một nhóm chức năng có ý nghĩa hơn. Ví dụ: Một form field gồm Label + Input + ErrorMessage, SearchBox (gồm input + icon filter), GroupCheckbox. Molecules giúp tái sử dụng những pattern nhỏ lặp đi lặp lại.
Organisms — Thành phần lớn gồm nhiều molecules và atoms cấu thành một khối chức năng lớn hoặc một phần của giao diện. Ví dụ: Header của trang, bảng dữ liệu Table, Form section, List with actions, Card lớn.
Hãy luôn xác định rõ component của bạn thuộc lớp nào và đặt vào đúng thư mục (atoms/, molecules/, organisms/), với mục đích:

Dễ tổ chức, bảo trì.
Code không lộn xộn giữa các cấp.
Dễ tái sử dụng ở quy mô phù hợp.
Ví dụ thực tế:

components/
  atoms/
    Button.tsx
    Input.tsx
    Label.tsx
  molecules/
    FormField.tsx      // gồm Label + Input + ErrorText
    SearchBox.tsx      // gồm Input + Button (icon search)
  organisms/
    Table.tsx
    AppHeader.tsx
    OrderListSection.tsx
Nếu một component chưa thực sự tái sử dụng hoặc “lớn”, hãy review lại cấp mình chọn cho phù hợp.

Mỗi component có file index.ts
Mỗi component (hoặc thư mục component) có index.ts (barrel) để export; các nơi khác import qua barrel (xem Import Convention).

Modal
Cấu trúc Modal chuẩn
Modal: Modal → ModalHeader, ModalBody, ModalFooter và phải có 1 dòng trống ngăn cách giữa các thành phần trong modal.

<Modal>
  <ModalHeader>{/* Tiêu đề */}</ModalHeader>
  {/* 1 line trống giữa các phần */}
  <ModalBody>{/* Nội dung */}</ModalBody>
  {/* 1 line trống giữa các phần */}
  <ModalFooter>{/* Hành động */}</ModalFooter>
</Modal>
Khoảng cách và comment trong ModalBody / ModalFooter
Trong ModalBody: cần có khoảng cách rõ ràng giữa các block nội dung bằng margin hoặc spacing, mỗi block nên có comment mô tả chức năng (bằng tiếng Anh).

Trong ModalFooter: các nút (ví dụ Cancel/Submit) phải được tách riêng ra, dễ phân biệt, có comment cho từng nút.

Ví dụ chuẩn:

<Modal>
  {/* ...your code here */}

  <ModalFooter>
    {/* Cancel button - closes modal */}
    <Button variant="secondary" onClick={onClose}>
      Cancel
    </Button>

    {/* Confirm button - submits order */}
    <Button variant="primary" onClick={onConfirm}>
      Confirm
    </Button>
  </ModalFooter>
</Modal>
Lưu ý: Đặt modal ở cuối phần return của file component, sau các nội dung chính, và luôn có comment mô tả rõ block/modal.


Strapi Schema & đồng bộ type
Khi dự án dùng Strapi (CMS) kết hợp Prisma, cần đồng bộ schema và kiểu TypeScript. Convention dưới đây bổ sung cho Prisma (client, transaction, soft delete).

Schema đúng với nghiệp vụ
Schema (Strapi content-types và/hoặc Prisma) phải khớp định nghĩa nghiệp vụ: đủ trường, đúng kiểu, quan hệ đúng hướng và cardinality.
Trường bắt buộc trong Strapi phản ánh non-null trong Prisma; optional trong Strapi dùng ? trong Prisma.
Backup và so sánh schema.prisma
Trước và sau khi đồng bộ schema từ DB (ví dụ npx prisma db pull hoặc script sync từ Strapi):

Backup file schema.prisma hiện tại.
Chạy lệnh pull/sync.
So sánh schema cũ và mới để tránh mất thay đổi tùy chỉnh (map, comment, tên relation) và gây lỗi code.
Trường bắt buộc → non-null trong Prisma
Các trường bắt buộc trong Strapi phải là non-null trong Prisma (không có ?).

model Customer {
  id        String   @id @default(cuid())
  name      String   // bắt buộc trong Strapi
  email     String?  // optional trong Strapi
  createdAt DateTime @default(now())
}
Đặt tên Model: PascalCase và Số ít (Singular)
Tên model phải sử dụng PascalCase (chữ cái đầu mỗi từ viết hoa), ví dụ: Customer, OrderItem.
Dùng danh từ số ít để đặt tên model, tránh dùng số nhiều. Ví dụ đúng: Customer ; ví dụ sai: Customers.
Ví dụ:

model Customer {
  id    String @id @default(cuid())
  name  String
  // ...
}

model OrderItem {
  id       String @id @default(cuid())
  orderId  String
  // ...
}
Tham khảo thêm Prisma - Schema.

Cập nhật Kiểu TypeScript tại src/types/strapi.ts
Bất cứ khi nào bạn thay đổi schema (trên Strapi hoặc Prisma), hãy đảm bảo cập nhật các kiểu TypeScript tương ứng trong src/types/strapi.ts (hoặc file type liên quan). Các kiểu này cần tuân thủ chuẩn đặt tên và cấu trúc của dự án, bao gồm cả quan hệ nếu API trả về dữ liệu lồng nhau (nested).

Ví dụ:

// src/types/strapi.ts

// Định nghĩa kiểu cho entity Customer trả về từ Strapi API
export type Customer = {
  id: string;
  name: string;
  email?: string; // optional
  createdAt: string;
  orders?: Order[]; // nếu API trả về nested quan hệ
}

export type Order = {
  id: string;
  total: number;
  customerId: string;
}
Kiểu dữ liệu TypeScript phải luôn đồng bộ với Strapi CMS và model Prisma nếu sử dụng cùng entity để đảm bảo type-safety và nhất quán trong toàn bộ dự án.

Server Actions
Quy tắc định nghĩa và sử dụng Server Actions trong Next.js App Router. Actions thuộc tầng entry point (xem Kiến trúc & các tầng): nhận input, gọi Services, trả kết quả — không gọi Prisma trực tiếp.

Định nghĩa file Action
Directive 'use server' ở dòng đầu tiên
Mỗi file Server Action đặt 'use server' ở dòng đầu tiên.

'use server';

import { withActionExceptionHandler } from '@/lib/action-handler';
import { createCustomerService } from '@/services/customer';
Dòng trống sau directive
Ngay sau 'use server' phải có một dòng trống rồi mới đến các câu lệnh import. Xem thêm Comments & Formatting - Directive.

Exception handling
Bọc Action bằng withActionExceptionHandler
Tất cả Server Actions bọc bởi withActionExceptionHandler (hoặc tương đương) để xử lý lỗi tập trung: log, map lỗi sang message user, trả về format thống nhất.

'use server';

import { withActionExceptionHandler } from '@/lib/action-handler';
import { createCustomerService } from '@/services/customer';

/**
 * Create a new customer.
 * @param input - Data required to create the customer.
 * @returns The created customer in standard response shape.
 */
export const createCustomerAction = withActionExceptionHandler(async (input: CreateCustomerInput) => {
  const customer = await createCustomerService(input);
  return { data: customer };
});
Transaction (nhiều thao tác DB atomic)
Mở transaction trong Action
Khi nghiệp vụ cần nhiều thao tác DB và phải atomic, transaction được mở trong Action (dùng prisma.$transaction).

"use server";

import { prisma } from "@/configs/prisma";

/**
 * Create a new order with order items and update inventory in a single atomic transaction.
 * @param input - Data required to create the order, including items.
 * @returns The created order wrapped in a standard response shape.
 */
export const createOrderAction = withActionExceptionHandler(async (input: CreateOrderInput) => {
  const createdOrder = await prisma.$transaction(async (tx) => {
    const order = await createOrder(tx, { data: { ... } });
    await createOrderItemsService(tx, order.id, input.items);
    await updateInventoryService(tx, input.items);
    return order;
  });

  return {
    status: HttpStatusCode.Ok,
    data: createdOrder
  };
});

Service layer
Logic DB qua Service; Action không gọi Prisma
Mọi logic truy cập database thực hiện trong Service layer (/src/services). Action không gọi prisma.* trừ prisma.$transaction.
Trách nhiệm Action: (1) nhận input, (2) validate sơ bộ nếu cần, (3) gọi Service hoặc mở transaction (một hoặc nhiều), (4) trả kết quả format chuẩn.
Đặt tên Action
Cấu trúc: <operation><EntityName>Action
operation: create, update, delete, get, …
EntityName: tên resource PascalCase; số ít khi trả về một bản ghi, số nhiều khi trả về danh sách.
Hậu tố cố định: Action.
export const createCustomerAction = ...
export const updateCustomerAction = ...
export const deleteCustomerAction = ...
export const getCustomerAction = ...   // 1 bản ghi
export const getCustomersAction = ...  // danh sách
JSDoc
Mọi Action có JSDoc
Mỗi Server Action có JSDoc ngay phía trên: mô tả ngắn, @param, @returns khi cần.

/**
 * Create a new customer.
 * @param input - Customer data.
 * @returns Created customer.
 */
export const createCustomerAction = withActionExceptionHandler(async (input) => {
  return createCustomerService(input);
});
Validation & constraint
Kiểm tra trùng (unique) trong Service
Trước khi create/update, nếu entity có trường unique theo nghiệp vụ thì bắt buộc kiểm tra trùng trong Service (không làm trong Action). Đặt tên hàm rõ ràng (ví dụ checkDuplicateEmail, isDuplicateCode).

Exclusive constraint khi update/delete
Khi sửa hoặc xóa, kiểm tra exclusive constraint (optimistic lock, version field) trong Service để tránh ghi đè dữ liệu cũ.


Lỗi thường gặp
Danh sách các vi phạm convention hay gặp khi review code. Mục đích là nhận diện nhanh và tránh lặp lại; chi tiết quy tắc xem các trang TypeScript, React, Next.js và Styling.

Không comment hàm / API
Vấn đề: Hàm public, Server Action, service quan trọng không có JSDoc hoặc comment mô tả hành vi, tham số, giá trị trả về.

Cách làm đúng: Thêm JSDoc cho function/API phức tạp; type rõ ràng thì có thể ngắn gọn. Xem Comments & Formatting và Server Actions.

Inline function trong JSX
Vấn đề: Truyền onClick={() => ...} hoặc onChange={(e) => ...} trực tiếp trong JSX khiến tạo hàm mới mỗi lần render, dễ gây re-render không cần thiết ở component con được memo.

Cách làm đúng: Dùng useCallback khi truyền xuống component tối ưu; hoặc tách handler ra biến/hàm có tên. Xem Hooks & useEffect và Styling - UI rules.

Inline style
Vấn đề: Dùng style={{ ... }} rải rác trong component thay vì class Tailwind/CSS module.

Cách làm đúng: Dùng class (Tailwind, CSS module), tránh inline style trừ trường hợp giá trị thực sự động (ví dụ width theo prop). Xem UI rules.

Không dùng cn (clsx + tailwind-merge)
Vấn đề: Ghép chuỗi class hoặc template string khiến class Tailwind xung đột (cùng thuộc tính) không được merge đúng; hoặc điều kiện class dài khó đọc.

Cách làm đúng: Dùng helper cn (clsx + tailwind-merge) để gộp class có điều kiện và resolve xung đột.

// bad
<div className={`px-4 py-2 ${active ? 'bg-blue-500' : 'bg-gray-200'}`} />

// good
import { cn } from '@/lib/utils';
<div className={cn('px-4 py-2', active ? 'bg-blue-500' : 'bg-gray-200')} />
Import không đúng quy ước
Vấn đề: Import sâu từng file thay vì barrel; import từ app/; barrel import không cần thiết gây bundle lớn; đường dẫn alias không thống nhất.

Cách làm đúng: Import qua index.ts khi team quy định; không import từ thư mục app cho shared code; dùng alias @/ thống nhất. Xem Modules.

Không có loading / skeleton
Vấn đề: Màn hình fetch dữ liệu nhưng không hiển thị trạng thái đang tải — user thấy trống hoặc nhảy layout.

Cách làm đúng: Dùng Skeleton (hoặc spinner có chủ đích) phản ánh layout nội dung. Xem Loading & Empty State.

Không có empty state
Vấn đề: Danh sách rỗng hoặc không có kết quả tìm kiếm nhưng không có message/CTA.

Cách làm đúng: Component Empty State rõ ràng (message + hành động nếu cần). Xem Loading & Empty State.

Không phân quyền trên Server Action / API
Vấn đề: Chỉ ẩn nút trên UI nhưng Action không kiểm tra quyền — user có thể gọi trực tiếp và thực hiện thao tác không được phép.

Cách làm đúng: Luôn kiểm tra auth/org/role trong Action (hoặc layer tương đương) trước khi thực hiện. Xem Authorization.

Tóm tắt checklist nhanh
Lỗi thường gặp	Hành động
Thiếu comment hàm/API	Bổ sung JSDoc / comment
Inline function trong JSX	useCallback hoặc handler tách riêng
Inline style	Class + Tailwind / CSS module
Class Tailwind xung đột	Dùng cn + tailwind-merge
Import lộn xộn	Barrel, alias, không import từ app
Không loading	Skeleton / trạng thái tải
Không empty state	Empty State component
Không phân quyền backend	Kiểm tra trong Server Action
