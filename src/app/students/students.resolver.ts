import { inject } from "@angular/core"
import { ResolveFn } from "@angular/router"
import { Student } from "models/student.model"
import { StudentService } from "services/student.service"

export const StudentsResolver: ResolveFn<Student[]> = () => {
  return inject(StudentService).findAll()
}
