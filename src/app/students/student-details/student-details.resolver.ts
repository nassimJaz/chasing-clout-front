import { inject } from "@angular/core"
import { ActivatedRouteSnapshot, ResolveFn, RouterStateSnapshot } from "@angular/router"
import { Observable } from "rxjs"
import { StudentService } from "services/student.service"
import { Student } from "models/student.model"

export const StudentDetailsResolver: ResolveFn<Student> = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  if (route.params["id"] == "new") {
    return new Observable((observer) => {
      observer.next({ firstName: "", lastName: "", major: { name: "", description: "", students: [] } })
    })
  }
  return inject(StudentService).findById(parseInt(route.params["id"], 10))
}
