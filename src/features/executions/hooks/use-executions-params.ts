import { executionsParams } from './../params';
import { useQueryStates } from "nuqs"



export const useExecutionsParams = () => {
    return useQueryStates(executionsParams)
}


